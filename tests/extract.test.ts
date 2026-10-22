import { describe, expect, it } from "vitest";
import { extractResults } from "@/lib/extract";
import { itemsFromSample } from "./helpers";

const EXPECTED: Record<string, number> = {
  glicose: 92,
  colesterol_total: 214,
  hdl: 38,
  ldl: 141,
  triglicerides: 162,
  tgo: 27,
  tgp: 54,
  creatinina: 1,
  hemoglobina: 14.2,
  plaquetas: 250000,
  tsh: 2.35,
};

describe.each([
  ["exemplo-layout-a.pdf", Object.keys(EXPECTED)],
  ["exemplo-layout-b.pdf", Object.keys(EXPECTED)],
  // layout C só traz os 8 primeiros exames
  ["exemplo-layout-c.pdf", Object.keys(EXPECTED).slice(0, 8)],
])("%s", (file, ids) => {
  it("acha cada exame e o resultado, e não confunde com a referência do laboratório", async () => {
    const items = await itemsFromSample(file);
    const out = extractResults(items, ids);
    const got = Object.fromEntries(out.results.map((r) => [r.examId, r.value]));
    expect(got).toEqual(Object.fromEntries(ids.map((id) => [id, EXPECTED[id]])));
    expect(out.notFound).toEqual([]);
  });
});

it("exame ausente no laudo vira 'notFound' (nunca é inventado)", async () => {
  const out = extractResults(await itemsFromSample("exemplo-layout-c.pdf"), ["glicose", "tsh"]);
  expect(out.results.map((r) => r.examId)).toEqual(["glicose"]);
  expect(out.notFound).toEqual(["tsh"]);
});

it("captura unidade e faixa do laboratório quando estão na linha", async () => {
  const out = extractResults(await itemsFromSample("exemplo-layout-a.pdf"), ["glicose"]);
  expect(out.results[0]).toMatchObject({ value: 92, unit: "mg/dL" });
});

it("não confunde 'Colesterol total' com HDL/LDL nem 'Hemoglobina' com glicada", () => {
  const mk = (str: string, y: number, x = 50) => ({ str, x, y, width: 40, page: 1 });
  const items = [
    mk("Hemoglobina glicada", 700), mk("5,4", 700, 250), mk("%", 700, 300),
    mk("Clearance de creatinina", 680), mk("95", 680, 250),
    mk("Hemoglobina", 660), mk("15,1", 660, 250), mk("g/dL", 660, 300),
  ];
  const out = extractResults(items, ["hba1c", "hemoglobina", "creatinina"]);
  const got = Object.fromEntries(out.results.map((r) => [r.examId, r.value]));
  expect(got).toEqual({ hba1c: 5.4, hemoglobina: 15.1 });
  expect(out.notFound).toEqual(["creatinina"]);
});

it("layout de bloco com 'RESULTADO 4,6 mEq/L' e referência em 'Valor de DE x A y' (laudo real, dados fictícios)", () => {
  const mk = (str: string, y: number, x = 50) => ({ str, x, y, width: 60, page: 1 });
  const items = [
    mk("POTASSIO", 700), mk("Material : Soro", 690), mk("Metodo : ELETRODO SELETIVO", 680),
    mk("RESULTADO 4,6 mEq/L", 670), mk("Valor de DE 3,5 A 5,1 mEq/L", 660), mk("Referencia :", 650),
    mk("25-HIDROXIVITAMINA D", 600), mk("Material : Soro", 590), mk("RESULTADO: 28,4 ng/mL", 580),
    mk("VR : DEFICIENTE : INFERIOR A 20,0 ng/mL", 570),
    mk("TSH ULTRA SENSÍVEL", 500), mk("RESULTADO: 2,25 microUI/mL", 480),
    mk("Leucocitos", 400), mk("7.900", 400, 200), mk("3500 - 10500", 400, 300),
  ];
  const out = extractResults(items, ["potassio", "vitamina_d", "tsh", "leucocitos"]);
  const by = Object.fromEntries(out.results.map((r) => [r.examId, r]));
  expect(by.potassio).toMatchObject({ value: 4.6, unit: "mEq/L", labReference: "DE 3,5 A 5,1 mEq/L" });
  expect(by.vitamina_d.value).toBe(28.4);
  expect(by.tsh).toMatchObject({ value: 2.25, unit: "microUI/mL" });
  expect(by.leucocitos).toMatchObject({ value: 7900, labReference: "3500 - 10500" });
});

it("exame personalizado criado pelo médico (ex.: Vitamina C) é encontrado pelo texto informado", async () => {
  const { makeCustomExam } = await import("@/lib/custom-exams");
  const { EXAMS } = await import("@/lib/exams");
  const vitC = makeCustomExam("Vitamina C", "Vitamina C, Ácido ascórbico", "mg/dL");
  const mk = (str: string, y: number, x = 50) => ({ str, x, y, width: 60, page: 1 });
  const items = [mk("Acido Ascorbico", 700), mk("0,8", 700, 220), mk("mg/dL", 700, 280), mk("0,4 a 2,0", 700, 340)];
  const out = extractResults(items, [vitC.id], [...EXAMS, vitC]);
  expect(out.results[0]).toMatchObject({ examId: vitC.id, value: 0.8, unit: "mg/dL" });
  expect(extractResults(items, [vitC.id], [...EXAMS, vitC]).notFound).toEqual([]);
});
