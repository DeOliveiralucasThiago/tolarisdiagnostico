import { describe, expect, it } from "vitest";
import { buildPresetFile, mergeImport, parsePresetFile, presetFileName } from "@/lib/preset-file";
import { EXAMS } from "@/lib/exams";
import type { Preset } from "@/lib/presets";
import type { ExamDefinition } from "@/lib/types";

const vitC: ExamDefinition = { id: "custom_abc123", name: "Vitamina C", unit: "mg/dL", aliases: ["vitamina c", "acido ascorbico"] };
const meu: Preset = { id: "p1", name: "Admissional", rules: { glicose: { attentionFrom: 10, alertFrom: 20 }, custom_abc123: { alertFrom: 2 } } };
let n = 0;
const makeId = () => `novo-${++n}`;

describe("exportar e importar", () => {
  it("ida e volta: o preset chega igual, com o exame personalizado que ele usa", () => {
    const file = buildPresetFile([meu], [...EXAMS, vitC, { ...vitC, id: "custom_naousado", name: "Outro" }]);
    expect(file.customExams.map((e) => e.id)).toEqual(["custom_abc123"]); // só o que o preset usa
    const parsed = parsePresetFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = mergeImport(parsed.file, { presets: [], customExams: [] }, makeId);
    expect(out.presets).toHaveLength(1);
    expect(out.presets[0]).toMatchObject({ name: "Admissional", rules: meu.rules });
    expect(out.customExams.map((e) => e.name)).toEqual(["Vitamina C"]);
    expect(out.report).toEqual({ presets: 1, addedExams: 1, skippedRules: 0 });
  });

  it("nunca sobrescreve: nome repetido ganha '(importado)' e o id é novo", () => {
    const parsed = parsePresetFile(JSON.stringify(buildPresetFile([meu], [...EXAMS, vitC])));
    if (!parsed.ok) throw new Error("falhou");
    const existing = { presets: [meu], customExams: [vitC] };
    const out = mergeImport(parsed.file, existing, makeId);
    expect(out.presets.map((x) => x.name)).toEqual(["Admissional", "Admissional (importado)"]);
    expect(out.presets[1].id).not.toBe("p1");
    expect(out.customExams).toHaveLength(1); // exame igual reaproveitado, não duplicado
    expect(out.presets[1].rules.custom_abc123).toEqual({ alertFrom: 2 });
  });

  it("exame personalizado com mesmo id mas outro conteúdo recebe id novo e as faixas acompanham", () => {
    const parsed = parsePresetFile(JSON.stringify(buildPresetFile([meu], [...EXAMS, vitC])));
    if (!parsed.ok) throw new Error("falhou");
    const outro: ExamDefinition = { id: "custom_abc123", name: "Ferro", unit: "", aliases: ["ferro"] };
    const out = mergeImport(parsed.file, { presets: [], customExams: [outro] }, makeId);
    const novo = out.customExams.find((e) => e.name === "Vitamina C")!;
    expect(novo.id).not.toBe("custom_abc123");
    expect(out.presets[0].rules[novo.id]).toEqual({ alertFrom: 2 });
    expect(out.presets[0].rules.custom_abc123).toBeUndefined();
  });

  it("faixas de exame desconhecido ficam de fora e são contadas", () => {
    const text = JSON.stringify({ app: "tolaris-diagnostico", kind: "presets", version: 1, presets: [{ name: "X", rules: { glicose: { alertFrom: 20 }, exame_que_nao_existe: { alertFrom: 1 } } }], customExams: [] });
    const parsed = parsePresetFile(text);
    if (!parsed.ok) throw new Error("falhou");
    const out = mergeImport(parsed.file, { presets: [], customExams: [] }, makeId);
    expect(Object.keys(out.presets[0].rules)).toEqual(["glicose"]);
    expect(out.report.skippedRules).toBe(1);
  });

  it("vários presets de uma vez", () => {
    const parsed = parsePresetFile(JSON.stringify(buildPresetFile([meu, { id: "p2", name: "Periódico", rules: { tsh: { alertFrom: 10 } } }], [...EXAMS, vitC])));
    if (!parsed.ok) throw new Error("falhou");
    expect(mergeImport(parsed.file, { presets: [], customExams: [] }, makeId).report.presets).toBe(2);
  });
});

describe("validação de arquivos recebidos (não confiáveis)", () => {
  const ok = { app: "tolaris-diagnostico", kind: "presets", version: 1, presets: [{ name: "A", rules: { glicose: { alertFrom: 20 } } }], customExams: [] };
  const bad = (o: unknown) => parsePresetFile(JSON.stringify(o));

  it.each([
    ["não é JSON", "isto nao e json"],
    ["outro aplicativo", JSON.stringify({ ...ok, app: "outro" })],
    ["versão futura", JSON.stringify({ ...ok, version: 2 })],
    ["sem presets", JSON.stringify({ ...ok, presets: [] })],
    ["preset sem nome", JSON.stringify({ ...ok, presets: [{ name: "  ", rules: {} }] })],
    ["faixa que não é número", JSON.stringify({ ...ok, presets: [{ name: "A", rules: { glicose: { alertFrom: "20" } } }] })],
    ["faixa infinita", '{"app":"tolaris-diagnostico","kind":"presets","version":1,"presets":[{"name":"A","rules":{"glicose":{"alertFrom":1e999}}}]}'],
    ["exame personalizado com id de exame embutido", JSON.stringify({ ...ok, customExams: [{ id: "glicose", name: "x", aliases: ["x"] }] })],
    ["exame personalizado sem texto de busca", JSON.stringify({ ...ok, customExams: [{ id: "custom_x", name: "x", aliases: [] }] })],
    ["arquivo enorme", "x".repeat(1_000_001)],
  ])("recusa: %s", (_nome, text) => {
    expect(parsePresetFile(text).ok).toBe(false);
  });

  it("ignora chaves perigosas e não polui objetos", () => {
    const text = '{"app":"tolaris-diagnostico","kind":"presets","version":1,"presets":[{"name":"A","rules":{"__proto__":{"alertFrom":1},"glicose":{"alertFrom":20}}}]}';
    const r = parsePresetFile(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.file.presets[0].rules)).toEqual(["glicose"]);
    expect(({} as Record<string, unknown>).alertFrom).toBeUndefined();
  });

  it("limita tamanho de texto e descarta lixo", () => {
    expect(bad({ ...ok, presets: [{ name: "n".repeat(500), rules: {} }] }).ok).toBe(false);
    expect(bad({ ...ok, presets: [{ name: "A", rules: { glicose: { alertFrom: 20, inventado: 5 } } }] }).ok).toBe(true);
  });
});

it("nome de arquivo seguro e legível", () => {
  expect(presetFileName([{ id: "1", name: "Médico do Trabalho / Admissional!", rules: {} }])).toBe("tolaris-preset-medico-do-trabalho-admissional.json");
  expect(presetFileName([meu, meu])).toBe("tolaris-preset-todos-os-presets.json");
});
