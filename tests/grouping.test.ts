import { describe, expect, it } from "vitest";
import { analyzeFiles } from "@/lib/analysis";
import { EXAMS } from "@/lib/exams";
import { buildGroups, findSuggestions, mergeGroups, nameKey, separateMember, type Member } from "@/lib/grouping";
import { DEFAULT_PRESET } from "@/lib/presets";
import type { TextItem } from "@/lib/types";

const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
const exam = (nome: string, valor: string, y: number, unit = "mg/dL"): TextItem[] => [mk(nome, y), mk(valor, y, 200), mk(unit, y, 260)];
const member = (id: string, name: string | undefined, birth: string | undefined, items: TextItem[] = [], problem?: string, cpf?: string): Member => ({
  id, fileName: `${id}.pdf`, items, info: { name, birth, cpf }, problem,
});

describe("chave de nome", () => {
  it("ignora acentos, maiúsculas e conectivos", () => {
    expect(nameKey("JOÃO DA SILVA")).toBe(nameKey("Joao Silva"));
    expect(nameKey("Maria de Souza")).toBe(nameKey("MARIA  SOUZA"));
    expect(nameKey("João Silva")).not.toBe(nameKey("João Souza"));
  });
});

describe("agrupamento automático", () => {
  it("une arquivos com mesmo nome E mesma data de nascimento", () => {
    const g = buildGroups([member("a", "JOÃO DA SILVA", "12/05/1985"), member("b", "Joao Silva", "12/05/1985")], {});
    expect(g).toHaveLength(1);
    expect(g[0].members.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("homônimos (mesmo nome, nascimentos diferentes) ficam separados e NÃO geram sugestão", () => {
    const g = buildGroups([member("a", "MARIA SOUZA", "03/11/1990"), member("b", "MARIA SOUZA", "01/01/1970")], {});
    expect(g).toHaveLength(2);
    expect(findSuggestions(g, new Set())).toEqual([]);
  });
  it("sem data de nascimento nunca une sozinho", () => {
    const g = buildGroups([member("a", "RUI ALVES", "09/09/1988"), member("b", "RUI ALVES", undefined)], {});
    expect(g).toHaveLength(2);
    expect(buildGroups([member("c", "RUI ALVES", undefined), member("d", "RUI ALVES", undefined)], {})).toHaveLength(2);
  });
  it("arquivo ilegível nunca entra em grupo", () => {
    const g = buildGroups([member("a", "X", "01/01/2000"), member("b", undefined, undefined, [], "Sem texto")], {});
    expect(g.map((x) => x.members.length)).toEqual([1, 1]);
  });
  it("mantém a ordem de envio", () => {
    const g = buildGroups([member("1", "ANA", "01/01/1990"), member("2", "BIA", "01/01/1991"), member("3", "ANA", "01/01/1990")], {});
    expect(g.map((x) => x.members.map((m) => m.id))).toEqual([["1", "3"], ["2"]]);
  });
});

describe("sugestão, unir e separar", () => {
  const base = [member("a", "RUI ALVES", "09/09/1988"), member("b", "Rui Alves", undefined)];
  it("sugere 'possível mesmo paciente' quando um lado não tem data de nascimento", () => {
    const g = buildGroups(base, {});
    const s = findSuggestions(g, new Set());
    expect(s).toHaveLength(1);
    expect([s[0].a.members[0].id, s[0].b.members[0].id]).toEqual(["a", "b"]);
  });
  it("sugere também quando nenhum dos dois tem nascimento, e respeita 'ignorar'", () => {
    const g = buildGroups([member("a", "RUI ALVES", undefined), member("b", "RUI ALVES", undefined)], {});
    const [s] = findSuggestions(g, new Set());
    expect(s).toBeTruthy();
    expect(findSuggestions(g, new Set([s.key]))).toEqual([]);
  });
  it("unir junta os dois e a sugestão some; separar desfaz", () => {
    let g = buildGroups(base, {});
    const [s] = findSuggestions(g, new Set());
    let manual = mergeGroups({}, s.a, s.b);
    g = buildGroups(base, manual);
    expect(g).toHaveLength(1);
    expect(g[0].birth).toBe("09/09/1988"); // pega a data de quem tem
    expect(findSuggestions(g, new Set())).toEqual([]);
    manual = separateMember(manual, "b");
    g = buildGroups(base, manual);
    expect(g).toHaveLength(2);
    expect(findSuggestions(g, new Set())).toEqual([]); // separado manualmente: não volta a sugerir
  });
  it("separar um arquivo de um grupo automático o torna um paciente à parte", () => {
    const two = [member("a", "ANA", "01/01/1990"), member("b", "ANA", "01/01/1990")];
    expect(buildGroups(two, separateMember({}, "b"))).toHaveLength(2);
  });
});

describe("exames de arquivos diferentes viram um paciente só", () => {
  const rules = { glicose: DEFAULT_PRESET.rules.glicose, hemoglobina: DEFAULT_PRESET.rules.hemoglobina, tsh: DEFAULT_PRESET.rules.tsh };
  const arq1 = { fileName: "glicemia.pdf", items: exam("Glicose", "131", 700) };
  const arq2 = { fileName: "hemograma.pdf", items: [...exam("Hemoglobina", "12,6", 700, "g/dL")] };

  it("João: glicemia num PDF e hemoglobina em outro formam uma análise completa", () => {
    const a = analyzeFiles([arq1, arq2], rules, EXAMS);
    const by = Object.fromEntries(a.rows.map((r) => [r.id, r]));
    expect(by.glicose.status).toBe("red");
    expect(by.hemoglobina.status).toBe("orange");
    expect(by.tsh.status).toBe("unknown"); // ausente nos dois: nunca verde
    expect(by.glicose.found?.source.file).toBe("glicemia.pdf");
    expect(by.hemoglobina.found?.source.file).toBe("hemograma.pdf");
    expect(a.counts).toMatchObject({ red: 1, orange: 1, unknown: 1, green: 0 });
  });
  it("com um único arquivo não mostra nome de arquivo na origem", () => {
    expect(analyzeFiles([arq1], rules, EXAMS).rows.find((r) => r.id === "glicose")?.found?.source.file).toBeUndefined();
  });
  it("mesmo exame em dois arquivos: vale o primeiro e o outro valor fica como alternativa", () => {
    const repetido = { fileName: "glicemia-2.pdf", items: exam("Glicose", "95", 700) };
    const a = analyzeFiles([arq1, repetido], rules, EXAMS);
    const g = a.rows.find((r) => r.id === "glicose")!;
    expect(g.value).toBe(131);
    expect(g.alternatives).toEqual([{ value: 95, raw: "95", file: "glicemia-2.pdf" }]);
  });
  it("mesmo exame com o mesmo valor nos dois arquivos não gera alerta de repetição", () => {
    const igual = { fileName: "copia.pdf", items: exam("Glicose", "131", 700) };
    expect(analyzeFiles([arq1, igual], rules, EXAMS).rows.find((r) => r.id === "glicose")?.alternatives).toBeUndefined();
  });
  it("correção do médico vale sobre o valor lido", () => {
    const a = analyzeFiles([arq1, arq2], rules, EXAMS, { glicose: "90" });
    expect(a.rows.find((r) => r.id === "glicose")?.status).toBe("green");
  });
});

describe("de ponta a ponta com PDFs fictícios", () => {
  it("Ana: glicemia e hemograma em arquivos diferentes; valor repetido é sinalizado", async () => {
    const { itemsFromFixture } = await import("./helpers");
    const { parsePatient } = await import("@/lib/patient");
    const load = async (f: string, id: string): Promise<Member> => {
      const items = await itemsFromFixture(f);
      return { id, fileName: f, items, info: parsePatient(items) };
    };
    const m1 = await load("ana-parte1-glicemia.pdf", "1");
    const m2 = await load("ana-parte2-hemograma.pdf", "2");
    const m3 = await load("ana-parte3-glicemia-repetida.pdf", "3");
    const rui1 = await load("rui-parte1.pdf", "4");
    const rui2 = await load("rui-parte2-sem-nascimento.pdf", "5");

    expect(m1.info).toEqual({ name: "ANA COSTA", birth: "09/09/1988" });
    expect(rui2.info).toMatchObject({ name: "RUI ALVES" }); // sem data de nascimento
    expect(rui2.info.birth).toBeUndefined();
    const groups = buildGroups([m1, m2, m3, rui1, rui2], {});
    expect(groups.map((g) => g.members.length)).toEqual([3, 1, 1]); // Ana unida; Rui separado
    expect(findSuggestions(groups, new Set())).toHaveLength(1); // Rui: possível mesmo paciente

    const rules = DEFAULT_PRESET.rules;
    const ana = analyzeFiles(groups[0].members.map((m) => ({ fileName: m.fileName, items: m.items })), rules, EXAMS);
    const by = Object.fromEntries(ana.rows.map((r) => [r.id, r]));
    expect(by.glicose.value).toBe(131);
    expect(by.glicose.alternatives?.[0]).toMatchObject({ value: 95, file: "ana-parte3-glicemia-repetida.pdf" });
    expect(by.hemoglobina.found?.source.file).toBe("ana-parte2-hemograma.pdf");
    expect(by.tsh.status).toBe("green");

    // depois de unir Rui, os exames dos dois arquivos aparecem juntos
    const [sg] = findSuggestions(groups, new Set());
    const unido = buildGroups([m1, m2, m3, rui1, rui2], mergeGroups({}, sg.a, sg.b)).find((g) => g.members.length === 2 && g.name === "RUI ALVES")!;
    const rui = analyzeFiles(unido.members.map((m) => ({ fileName: m.fileName, items: m.items })), rules, EXAMS);
    expect(rui.rows.find((r) => r.id === "glicose")?.value).toBe(92);
    expect(rui.rows.find((r) => r.id === "hemoglobina")?.value).toBe(14);
  });
});


const CPF_A = "11144477735";
const CPF_B = "52998224725";
const CPF_C = "39053344705";

describe("vínculo por CPF (só para achar os arquivos do mesmo paciente)", () => {
  it("os CPFs de teste são válidos (dígitos verificadores)", async () => {
    const { isValidCpf } = await import("@/lib/cpf");
    expect([CPF_A, CPF_B, CPF_C].map(isValidCpf)).toEqual([true, true, true]);
  });

  it("mesmo CPF une os arquivos mesmo sem data de nascimento num deles", () => {
    const g = buildGroups([member("a", "ANA COSTA", "09/09/1988", [], undefined, CPF_A), member("b", "ANA COSTA", undefined, [], undefined, CPF_A)], {});
    expect(g).toHaveLength(1);
    expect(g[0].via).toBe("cpf");
    expect(findSuggestions(g, new Set())).toEqual([]);
  });

  it("mesmo CPF une mesmo com nome escrito de outro jeito (primeiro e último nome batem)", () => {
    const g = buildGroups([member("a", "JOÃO DA SILVA", "12/05/1985", [], undefined, CPF_A), member("b", "João Pedro Silva", "12/05/1985", [], undefined, CPF_A)], {});
    expect(g).toHaveLength(1);
  });

  it("mesmo CPF, mas nomes bem diferentes: NÃO une sozinho e pede confirmação", () => {
    const g = buildGroups([member("a", "ANA COSTA", "09/09/1988", [], undefined, CPF_A), member("b", "CARLA MENDES", "09/09/1988", [], undefined, CPF_A)], {});
    expect(g).toHaveLength(2);
    const s = findSuggestions(g, new Set());
    expect(s).toHaveLength(1);
    expect(s[0].reason).toBe("cpf");
  });

  it("mesmo CPF com nascimentos diferentes: não une sozinho (pode ser erro do laboratório)", () => {
    const g = buildGroups([member("a", "ANA COSTA", "09/09/1988", [], undefined, CPF_A), member("b", "ANA COSTA", "10/10/1990", [], undefined, CPF_A)], {});
    expect(g).toHaveLength(2);
    expect(findSuggestions(g, new Set())[0].reason).toBe("cpf");
  });

  it("CPFs diferentes com mesmo nome e nascimento são pessoas diferentes: nunca une nem sugere", () => {
    const g = buildGroups([member("a", "BIA LIMA", "05/05/1995", [], undefined, CPF_B), member("b", "BIA LIMA", "05/05/1995", [], undefined, CPF_C)], {});
    expect(g).toHaveLength(2);
    expect(findSuggestions(g, new Set())).toEqual([]);
  });

  it("laudo sem CPF com o mesmo nome e nascimento de UM paciente com CPF entra nele", () => {
    const g = buildGroups([member("a", "BIA LIMA", "05/05/1995", [], undefined, CPF_B), member("b", "BIA LIMA", "05/05/1995")], {});
    expect(g).toHaveLength(1);
    expect(g[0].members).toHaveLength(2);
    expect(g[0].via).toBe("nome");
  });

  it("laudo sem CPF que combina com DOIS pacientes de CPFs diferentes fica separado e pede decisão", () => {
    const base = [member("a", "BIA LIMA", "05/05/1995", [], undefined, CPF_B), member("b", "BIA LIMA", "05/05/1995", [], undefined, CPF_C), member("c", "BIA LIMA", "05/05/1995")];
    for (const ordem of [base, [base[2], base[0], base[1]], [base[0], base[2], base[1]]]) {
      const g = buildGroups(ordem, {});
      expect(g).toHaveLength(3); // o resultado não depende da ordem de envio
      const s = findSuggestions(g, new Set());
      expect(s).toHaveLength(2);
      expect(s.every((x) => x.reason === "ambiguous")).toBe(true);
    }
  });

  it("depois de o médico unir o laudo ambíguo a um dos pacientes, as sugestões desse laudo somem", () => {
    const ms = [member("a", "BIA LIMA", "05/05/1995", [], undefined, CPF_B), member("b", "BIA LIMA", "05/05/1995", [], undefined, CPF_C), member("c", "BIA LIMA", "05/05/1995")];
    const g = buildGroups(ms, {});
    const [s] = findSuggestions(g, new Set());
    const g2 = buildGroups(ms, mergeGroups({}, s.a.members[0].id === "c" ? s.b : s.a, s.a.members[0].id === "c" ? s.a : s.b));
    expect(g2).toHaveLength(2);
  });

  it("CPF só entra se for válido: um CPF mal lido (OCR) é ignorado", async () => {
    const { extractCpf } = await import("@/lib/cpf");
    expect(extractCpf("CPF: 111.444.777-35")).toBe(CPF_A);
    expect(extractCpf("CPF: 111.444.777-36")).toBeUndefined();
    expect(extractCpf("CPF: 111.111.111-11")).toBeUndefined();
  });

  it("o CPF nunca aparece na planilha nem no resumo", async () => {
    const { buildBatchCsv, buildSummaryText } = await import("@/lib/export");
    const [g] = buildGroups([member("a", "ANA COSTA", "09/09/1988", [], undefined, CPF_A)], {});
    const p = { label: "Ana Costa", fileName: "a.pdf", analysis: null, problem: "x", birth: g.birth };
    const saida = buildBatchCsv([p], []) + buildSummaryText(p, "P");
    expect(saida).not.toContain(CPF_A);
    expect(saida).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});
