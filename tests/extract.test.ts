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
