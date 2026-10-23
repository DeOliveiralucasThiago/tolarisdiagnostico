import { parseNumberBR } from "./numbers";

export interface Bounds {
  lo?: number;
  hi?: number;
}

const NUM = /\d+(?:[.,]\d+)*/g;

/** Lê a faixa impressa pelo laboratório: "13,5 a 17,5", "até 40", "inferior a 190", "superior a 40", "< 200". */
export function referenceBounds(text: string | undefined): Bounds | null {
  if (!text) return null;
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const nums = (plain.match(NUM) ?? []).map(parseNumberBR).filter((n): n is number => n != null);
  if (nums.length >= 2) return { lo: Math.min(nums[0], nums[1]), hi: Math.max(nums[0], nums[1]) };
  if (nums.length === 1) {
    if (/(superior|maior|acima|>)/.test(plain)) return { lo: nums[0] };
    if (/(ate|inferior|menor|abaixo|<)/.test(plain)) return { hi: nums[0] };
  }
  return null;
}

/**
 * Um valor lido por OCR muito além da faixa do laboratório costuma ser erro de leitura (vírgula perdida:
 * "15,1" lido como "151"). Não corrige nada: só avisa o médico para conferir com o original.
 */
export function implausibleReason(value: number, bounds: Bounds | null): string | null {
  if (!bounds) return null;
  if (bounds.hi != null && bounds.hi > 0 && value > bounds.hi * 5) return `muito acima da faixa do laboratório (até ${bounds.hi})`;
  if (bounds.lo != null && bounds.lo > 0 && value < bounds.lo / 5) return `muito abaixo da faixa do laboratório (a partir de ${bounds.lo})`;
  return null;
}
