import { describe, expect, it } from "vitest";
import { binarizeAdaptive } from "@/lib/ocr";
import { implausibleReason, referenceBounds } from "@/lib/plausibility";
import { analyzeFiles } from "@/lib/analysis";
import { extractResults } from "@/lib/extract";
import { EXAMS } from "@/lib/exams";
import { DEFAULT_PRESET } from "@/lib/presets";
import type { TextItem } from "@/lib/types";

describe("referenceBounds", () => {
  it.each([
    ["13,5 a 17,5", { lo: 13.5, hi: 17.5 }],
    ["13,5 - 17,5", { lo: 13.5, hi: 17.5 }],
    ["150.000 a 450.000", { lo: 150000, hi: 450000 }],
    ["até 40", { hi: 40 }],
    ["inferior a 190", { hi: 190 }],
    ["superior a 40", { lo: 40 }],
    ["< 200", { hi: 200 }],
  ])("%s", (txt, expected) => expect(referenceBounds(txt)).toEqual(expected));
  it("sem números ou sem direção claras: null", () => {
    expect(referenceBounds("ver observação")).toBeNull();
    expect(referenceBounds(undefined)).toBeNull();
    expect(referenceBounds("normal 40")).toBeNull();
  });
});

describe("implausibleReason", () => {
  const hb = { lo: 13.5, hi: 17.5 };
  it("vírgula perdida (15,1 lido como 151) é detectada", () => expect(implausibleReason(151, hb)).toMatch(/muito acima/));
  it("valores alterados mas plausíveis não são marcados", () => {
    expect(implausibleReason(12.6, hb)).toBeNull();
    expect(implausibleReason(24, hb)).toBeNull();
    expect(implausibleReason(250, { hi: 190 })).toBeNull();
  });
  it("sem faixa não marca nada", () => expect(implausibleReason(999, null)).toBeNull());
});

describe("OCR no pipeline de análise", () => {
  const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
  const rows = [mk("Hemoglobina", 700), mk("151", 700, 200), mk("g/dL", 700, 260), mk("13,5", 700, 320), mk("-", 700, 350), mk("17,5", 700, 380)];

  it("em OCR, número que destoa da faixa do laboratório vira 'conferir'; em PDF de texto não", () => {
    const rules = { hemoglobina: DEFAULT_PRESET.rules.hemoglobina };
    const ocr = analyzeFiles([{ fileName: "foto.jpg", items: rows, ocr: true }], rules, EXAMS).rows[0];
    expect(ocr.suspect).toMatch(/muito acima/);
    const texto = analyzeFiles([{ fileName: "a.pdf", items: rows }], rules, EXAMS).rows[0];
    expect(texto.suspect).toBeUndefined();
  });
  it("quando o médico digita o valor correto, o alerta some", () => {
    const rules = { hemoglobina: DEFAULT_PRESET.rules.hemoglobina };
    const r = analyzeFiles([{ fileName: "foto.jpg", items: rows, ocr: true }], rules, EXAMS, { hemoglobina: "15,1" }).rows[0];
    expect(r.suspect).toBeUndefined();
    expect(r.value).toBe(15.1);
  });
});

describe("nomes aproximados (só em OCR)", () => {
  const mk = (str: string, y: number, x = 50): TextItem => ({ str, x, y, width: 60, page: 1 });
  const items = [mk("ALTITGP", 700), mk("47", 700, 200), mk("U/L", 700, 260)]; // "ALT/TGP" com a barra lida como "I"
  it("com OCR, ALTITGP é reconhecido como TGP", () => {
    expect(extractResults(items, ["tgp"], EXAMS, { fuzzy: true }).results[0]?.value).toBe(47);
  });
  it("sem OCR (PDF de texto) o nome continua exato: não adivinha", () => {
    expect(extractResults(items, ["tgp"], EXAMS).results).toHaveLength(0);
  });
  it("nomes curtos não são aproximados (LDL ≠ HDL)", () => {
    const hdl = [mk("LDL", 700), mk("98", 700, 200)];
    expect(extractResults(hdl, ["hdl"], EXAMS, { fuzzy: true }).results).toHaveLength(0);
  });
});

describe("binarizeAdaptive", () => {
  it("separa texto escuro do papel e ignora sombra suave", () => {
    const w = 120, h = 40, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const shade = 255 - Math.round((x / w) * 90); // gradiente: lado direito mais escuro
      const text = y > 15 && y < 24 && x > 20 && x < 100 && x % 4 < 2; // traços
      const v = text ? shade - 140 : shade;
      const o = (y * w + x) * 4; px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255;
    }
    const out = binarizeAdaptive(px, w, h);
    const at = (x: number, y: number) => out[(y * w + x) * 4];
    expect(at(60, 5)).toBe(255);   // papel (mesmo no lado escuro)
    expect(at(110, 5)).toBe(255);
    expect(at(24, 20)).toBe(0);    // traço
    expect(at(92, 20)).toBe(0);    // traço no lado sombreado
  });
});
