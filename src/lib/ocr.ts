import type { TextItem } from "./types";

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrLine {
  words: OcrWord[];
}

/** Palavras com confiança abaixo disto costumam ser ruído (manchas, bordas de tabela). */
const MIN_CONFIDENCE = 10;

/**
 * Converte as linhas reconhecidas (pixels, origem no topo) para o mesmo formato do texto de um PDF
 * (unidades de PDF, origem embaixo). Todas as palavras de uma linha ficam na mesma altura, o que mantém
 * "Glicose  92  mg/dL" junto numa linha mesmo que a foto esteja levemente torta.
 */
export function linesToItems(lines: OcrLine[], page: number, heightPx: number, scale: number): TextItem[] {
  const items: TextItem[] = [];
  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim() !== "" && w.confidence >= MIN_CONFIDENCE);
    if (!words.length) continue;
    const bottom = words.reduce((sum, w) => sum + w.bbox.y1, 0) / words.length;
    const y = (heightPx - bottom) / scale;
    for (const w of words) {
      items.push({ str: w.text.trim(), x: w.bbox.x0 / scale, y, width: (w.bbox.x1 - w.bbox.x0) / scale, page });
    }
  }
  return items;
}

/** Largura-alvo (em pixels) da imagem enviada ao OCR: nítida o bastante sem estourar a memória. */
export const OCR_TARGET_WIDTH = 2000;
export const OCR_MAX_PAGES = 40;

export function ocrScaleFor(widthUnits: number): number {
  return Math.min(4, Math.max(1.5, OCR_TARGET_WIDTH / widthUnits));
}

/**
 * Pré-tratamento para fotos: cinza + limiarização adaptativa (média local). Elimina sombras e papel amarelado
 * que confundem o reconhecimento. Recebe e devolve pixels RGBA.
 */
export function binarizeAdaptive(rgba: Uint8ClampedArray, w: number, h: number, bias = 0.1): Uint8ClampedArray {
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;

  // imagem integral (soma acumulada) para a média de qualquer janela em tempo constante
  const stride = w + 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }

  const r = Math.max(8, Math.round(w / 40));
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x] < mean * (1 - bias) ? 0 : 255;
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Estima a inclinação do texto (em graus) pelo perfil horizontal: o ângulo em que as linhas de texto ficam mais
 * "alinhadas" (maior variância das alturas) é o certo. Convenção de canvas (y para baixo): girar a imagem por
 * `estimateSkew(...)` graus no sentido horário endireita o texto. Devolve 0 se não houver texto suficiente.
 */
export function estimateSkew(gray: Uint8Array | Uint8ClampedArray, w: number, h: number, maxDeg = 5): number {
  // amostra os pixels escuros (texto) numa grade, no máximo ~40 mil pontos
  const dark: number[] = [];
  let sum = 0;
  for (let i = 0; i < gray.length; i += 7) sum += gray[i];
  const thr = (sum / Math.ceil(gray.length / 7)) * 0.7;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (gray[y * w + x] < thr) dark.push(x, y);
  if (dark.length < 400) return 0;

  const bins = Math.ceil(Math.hypot(w, h) / step) + 2;
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
    const hist = new Float64Array(bins);
    const off = Math.abs(w * sin) / step;
    for (let i = 0; i < dark.length; i += 2) {
      const y = (dark[i] * sin + dark[i + 1] * cos) / step + off;
      hist[Math.min(bins - 1, Math.max(0, Math.round(y)))]++;
    }
    let sq = 0;
    for (const c of hist) sq += c * c;
    return sq;
  };

  let best = 0, bestScore = score(0);
  for (let d = -maxDeg; d <= maxDeg; d += 0.5) {
    const sc = score(d);
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  for (let d = best - 0.5; d <= best + 0.5; d += 0.1) {
    const sc = score(d);
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return Math.abs(best) < 0.3 ? 0 : Math.round(best * 10) / 10;
}

export function grayFromRgba(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return gray;
}
