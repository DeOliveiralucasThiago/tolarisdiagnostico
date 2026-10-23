import { describe, expect, it } from "vitest";
import { analyzeFiles } from "@/lib/analysis";
import { EXAMS } from "@/lib/exams";
import { ageAtExam, parsePatient, parseBR } from "@/lib/patient";
import { buildPresetFile, mergeImport, parsePresetFile } from "@/lib/preset-file";
import { evaluate, resolveRule, variantLabel } from "@/lib/status";
import { buildGroups, type Member } from "@/lib/grouping";
import type { Rule, TextItem } from "@/lib/types";

// Hemoglobina: geral <13,5 laranja / <12 vermelho; mulheres <12 / <10; homens <13,5 / <12; crianças até 17 anos <11 / <9
const hb: Rule = {
  attentionBelow: 13.5, alertBelow: 12,
  variants: [
    { sex: "F", ageMin: 18, attentionBelow: 12, alertBelow: 10 },
    { sex: "M", ageMin: 18, attentionBelow: 13.5, alertBelow: 12 },
    { ageMax: 17, attentionBelow: 11, alertBelow: 9 },
  ],
};

describe("resolveRule / evaluate com sexo e idade", () => {
  it("escolhe a faixa que combina com sexo e idade", () => {
    expect(resolveRule(hb, { sex: "F", age: 30 })).toMatchObject({ label: "Mulheres, 18 anos ou mais", thresholds: { attentionBelow: 12 } });
    expect(resolveRule(hb, { sex: "M", age: 30 }).thresholds).toMatchObject({ attentionBelow: 13.5 });
    expect(resolveRule(hb, { sex: "F", age: 12 }).label).toBe("até 17 anos");
  });

  it("o mesmo valor muda de situação conforme o sexo (12,5: normal para mulher, atenção para homem)", () => {
    expect(evaluate(12.5, hb, { sex: "F", age: 30 })).toBe("green");
    expect(evaluate(12.5, hb, { sex: "M", age: 30 })).toBe("orange");
    expect(evaluate(11.5, hb, { sex: "F", age: 30 })).toBe("orange");
    expect(evaluate(9.5, hb, { sex: "F", age: 30 })).toBe("red");
  });

  it("limites de idade são inclusivos", () => {
    expect(resolveRule(hb, { sex: "F", age: 18 }).label).toBe("Mulheres, 18 anos ou mais");
    expect(resolveRule(hb, { sex: "F", age: 17 }).label).toBe("até 17 anos");
  });

  it("sem o sexo do paciente, usa a faixa geral e avisa que faltou o dado (não adivinha)", () => {
    const r = resolveRule(hb, { age: 30 });
    expect(r.label).toBe("Geral");
    expect(r.missing).toBe("sexo");
    expect(r.thresholds).toMatchObject({ attentionBelow: 13.5, alertBelow: 12 });
  });

  it("exame SÓ com faixas por sexo e sexo desconhecido: não avalia (cinza), nunca verde", () => {
    const soSexo: Rule = { variants: [{ sex: "F", alertFrom: 20 }, { sex: "M", alertFrom: 30 }] };
    expect(resolveRule(soSexo, {})).toEqual({ thresholds: null, missing: "sexo" });
    expect(evaluate(5, soSexo, {})).toBe("unknown");
    expect(evaluate(25, soSexo, { sex: "F" })).toBe("red");
    expect(evaluate(25, soSexo, { sex: "M" })).toBe("green");
  });

  it("faixa por idade com idade desconhecida: pula e registra 'idade'", () => {
    const idade: Rule = { alertFrom: 100, variants: [{ ageMin: 60, alertFrom: 140 }] };
    expect(resolveRule(idade, { age: null })).toMatchObject({ label: "Geral", missing: "idade" });
    expect(evaluate(120, idade, { age: 70 })).toBe("green");
    expect(evaluate(120, idade, { age: 40 })).toBe("red");
  });

  it("a ordem das variantes manda: a primeira que combina vale", () => {
    const r: Rule = { variants: [{ ageMin: 40, alertFrom: 10 }, { sex: "F", alertFrom: 50 }] };
    expect(resolveRule(r, { sex: "F", age: 50 }).thresholds).toMatchObject({ alertFrom: 10 });
  });

  it("sem variantes, tudo funciona como antes (regra simples)", () => {
    expect(evaluate(25, { attentionFrom: 10, alertFrom: 20 })).toBe("red");
    expect(resolveRule({ alertFrom: 5 }, { sex: "F", age: 3 }).label).toBeUndefined();
  });

  it("rótulos legíveis", () => {
    expect(variantLabel({ sex: "M", ageMin: 18, ageMax: 40 })).toBe("Homens, 18–40 anos");
    expect(variantLabel({ ageMax: 17 })).toBe("até 17 anos");
    expect(variantLabel({})).toBe("Todos");
  });
});

describe("análise de um paciente com sexo e idade", () => {
  const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
  const items = [mk("Hemoglobina", 700), mk("12,5", 700, 200), mk("g/dL", 700, 260)];
  const rules = { hemoglobina: hb };

  it("mostra qual faixa valeu e muda a situação conforme o paciente", () => {
    const mulher = analyzeFiles([{ fileName: "a", items }], rules, EXAMS, {}, { sex: "F", age: 30 }).rows[0];
    const homem = analyzeFiles([{ fileName: "a", items }], rules, EXAMS, {}, { sex: "M", age: 30 }).rows[0];
    expect([mulher.status, homem.status]).toEqual(["green", "orange"]);
    expect(mulher.ruleLabel).toBe("Mulheres, 18 anos ou mais");
    expect(homem.ruleLabel).toBe("Homens, 18 anos ou mais");
  });
  it("sexo desconhecido: usa a faixa geral e sinaliza o que faltou", () => {
    const r = analyzeFiles([{ fileName: "a", items }], rules, EXAMS, {}, { age: 30 }).rows[0];
    expect(r.ruleLabel).toBe("Geral");
    expect(r.ruleMissing).toBe("sexo");
  });
});

describe("leitura de sexo e data do exame no cabeçalho", () => {
  const mk = (str: string, y: number): TextItem => ({ str, x: 50, y, width: 60, page: 1 });
  const head = (...l: string[]) => l.map((t, i) => mk(t, 800 - i * 12));

  it("lê 'Sexo: Feminino' / 'Sexo: M' / 'Gênero: Masculino'", () => {
    expect(parsePatient(head("Paciente: ANA", "Sexo: Feminino")).sex).toBe("F");
    expect(parsePatient(head("Paciente: RUI", "SEXO: M")).sex).toBe("M");
    expect(parsePatient(head("Paciente: RUI", "Gênero: Masculino")).sex).toBe("M");
  });
  it("não confunde tabela de referência ('SEXO MASCULINO SEXO FEMININO') com o sexo do paciente", () => {
    expect(parsePatient(head("Paciente: ANA", "IDADE SEXO MASCULINO SEXO FEMININO")).sex).toBeUndefined();
  });
  it("sem a informação no laudo, o sexo fica indefinido (nunca deduzido pelo nome)", () => {
    expect(parsePatient(head("Paciente: MARIA SOUZA")).sex).toBeUndefined();
  });
  it("lê a data da coleta/entrada e calcula a idade NA DATA DO EXAME", () => {
    const info = parsePatient(head("CLIENTE: JOÃO DA SILVA DN: 07/02/1993", "DATA ENTRADA: 25/06/2025 - 06:48:12 REQUISIÇÃO: 1"));
    expect(info.examDate).toBe("25/06/2025");
    expect(ageAtExam(info.birth, info.examDate, new Date(2026, 9, 23))).toBe(32); // hoje seria 33
    expect(ageAtExam("07/02/1993", undefined, new Date(2026, 9, 23))).toBe(33); // sem data do exame, usa hoje
    expect(parsePatient(head("Paciente: A", "Data/Hora Coleta: 10/03/2024 - 07:12")).examDate).toBe("10/03/2024");
  });
  it("datas inválidas são ignoradas", () => {
    expect(parseBR("31/02/2025")).toBeNull();
    expect(parseBR("25/06/2025")).toBeInstanceOf(Date);
  });
});

describe("sexo nos grupos de arquivos", () => {
  const m = (id: string, sex?: "M" | "F"): Member => ({ id, fileName: `${id}.pdf`, items: [], info: { name: "ANA COSTA", birth: "01/01/1990", sex } });
  it("laudos que concordam (ou só um informa) dão o sexo ao grupo", () => {
    expect(buildGroups([m("a", "F"), m("b")], {})[0].sex).toBe("F");
  });
  it("laudos do mesmo paciente com sexos diferentes: não escolhe, sinaliza conflito", () => {
    const g = buildGroups([m("a", "F"), m("b", "M")], {})[0];
    expect(g.sex).toBeUndefined();
    expect(g.sexConflict).toBe(true);
  });
});

describe("arquivo de preset com faixas por sexo/idade", () => {
  const preset = { id: "1", name: "Periódico", rules: { hemoglobina: hb } };
  it("ida e volta preserva as variantes", () => {
    const parsed = parsePresetFile(JSON.stringify(buildPresetFile([preset], EXAMS)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = mergeImport(parsed.file, { presets: [], customExams: [] }, () => "novo");
    expect(out.presets[0].rules.hemoglobina).toEqual(hb);
  });
  const arquivo = (rule: unknown) => JSON.stringify({ app: "tolaris-diagnostico", kind: "presets", version: 1, presets: [{ name: "X", rules: { glicose: rule } }] });
  it.each([
    ["sexo inválido", { variants: [{ sex: "X", alertFrom: 1 }] }],
    ["idade negativa", { variants: [{ ageMin: -1, alertFrom: 1 }] }],
    ["idade absurda", { variants: [{ ageMax: 500, alertFrom: 1 }] }],
    ["limite que não é número", { variants: [{ alertFrom: "20" }] }],
    ["variantes que não são lista", { variants: { sex: "F" } }],
    ["variantes demais", { variants: Array.from({ length: 13 }, () => ({ alertFrom: 1 })) }],
    ["variante que não é objeto", { variants: [5] }],
  ])("recusa: %s", (_n, rule) => expect(parsePresetFile(arquivo(rule)).ok).toBe(false));
  it("descarta campos desconhecidos nas variantes", () => {
    const r = parsePresetFile(arquivo({ variants: [{ sex: "F", alertFrom: 20, inventado: 1 }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.presets[0].rules.glicose.variants).toEqual([{ sex: "F", alertFrom: 20 }]);
  });
});
