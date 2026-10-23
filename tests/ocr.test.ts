import { describe, expect, it } from "vitest";
import { extractResults } from "@/lib/extract";
import { linesToItems, ocrScaleFor, type OcrLine } from "@/lib/ocr";

const w = (text: string, x0: number, y1: number, confidence = 90): OcrLine["words"][number] => ({
  text, confidence, bbox: { x0, y0: y1 - 20, x1: x0 + text.length * 12, y1 },
});

describe("linesToItems (OCR -> mesmo formato do texto do PDF)", () => {
  it("converte pixels para unidades de PDF com origem embaixo", () => {
    const [it1] = linesToItems([{ words: [w("Glicose", 200, 400)] }], 1, 2800, 2);
    expect(it1).toMatchObject({ str: "Glicose", x: 100, y: 1200, page: 1 });
    expect(it1.width).toBeCloseTo((7 * 12) / 2);
  });

  it("palavras de uma linha ficam na mesma altura, mesmo com a foto levemente torta", () => {
    const items = linesToItems([{ words: [w("Glicose", 100, 500), w("92", 500, 506), w("mg/dL", 600, 512)] }], 1, 2800, 2);
    expect(new Set(items.map((i) => i.y)).size).toBe(1);
  });

  it("descarta ruído de baixa confiança e palavras vazias", () => {
    const items = linesToItems([{ words: [w("|", 10, 400, 3), w("  ", 20, 400), w("TSH", 30, 400, 80)] }], 1, 1000, 1);
    expect(items.map((i) => i.str)).toEqual(["TSH"]);
  });

  it("o texto reconhecido passa pelo mesmo leitor de exames do PDF", () => {
    const lines: OcrLine[] = [
      { words: [w("Hemoglobina", 100, 700), w("12,6", 500, 704), w("g/dL", 600, 700), w("13,5", 760, 702), w("-", 820, 702), w("17,5", 850, 702)] },
      { words: [w("Plaquetas", 100, 760), w("310.000", 500, 762), w("/mm³", 640, 760)] },
    ];
    const out = extractResults(linesToItems(lines, 1, 2800, 3), ["hemoglobina", "plaquetas"]);
    expect(Object.fromEntries(out.results.map((r) => [r.examId, r.value]))).toEqual({ hemoglobina: 12.6, plaquetas: 310000 });
  });

  it("escala da imagem: alvo de ~2000 px de largura, entre 1,5x e 4x", () => {
    expect(ocrScaleFor(595)).toBeCloseTo(3.36, 1);
    expect(ocrScaleFor(2000)).toBe(1.5);
    expect(ocrScaleFor(300)).toBe(4);
  });
});
