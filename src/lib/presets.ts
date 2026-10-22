import type { Rule } from "./types";

export interface Preset {
  id: string;
  name: string;
  /** Exames sem regra no preset não entram na análise. */
  rules: Record<string, Rule>;
}

/**
 * Valores de EXEMPLO apenas para demonstrar a ferramenta.
 * Cada médico deve definir as suas próprias faixas.
 */
export const DEFAULT_PRESET: Preset = {
  id: "exemplo",
  name: "Exemplo (ajuste conforme seu critério)",
  rules: {
    glicose: { attentionFrom: 100, alertFrom: 126 },
    hba1c: { attentionFrom: 5.7, alertFrom: 6.5 },
    colesterol_total: { attentionFrom: 190, alertFrom: 240 },
    hdl: { attentionBelow: 40, alertBelow: 30 },
    ldl: { attentionFrom: 130, alertFrom: 160 },
    triglicerides: { attentionFrom: 150, alertFrom: 200 },
    tgo: { attentionFrom: 40, alertFrom: 80 },
    tgp: { attentionFrom: 41, alertFrom: 82 },
    creatinina: { attentionFrom: 1.3, alertFrom: 2 },
    hemoglobina: { attentionBelow: 13.5, alertBelow: 12 },
    plaquetas: { attentionBelow: 150000, alertBelow: 100000 },
    tsh: { attentionFrom: 4.5, alertFrom: 10 },
  },
};

const KEY = "tolaris.presets.v1";

/** Os presets (somente faixas, sem dados de paciente) ficam no navegador do médico. */
export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Preset[]) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* armazenamento indisponível: segue com o padrão */
  }
  return [DEFAULT_PRESET];
}

export function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    /* ignora */
  }
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}
