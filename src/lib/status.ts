import type { Rule, Status } from "./types";

export function evaluate(value: number | null | undefined, rule: Rule | undefined): Status {
  if (value == null || Number.isNaN(value) || !rule) return "unknown";
  // regra sem nenhuma faixa definida: nada a avaliar (não pode virar "verde")
  if (rule.attentionFrom == null && rule.alertFrom == null && rule.attentionBelow == null && rule.alertBelow == null) return "unknown";
  if (rule.alertFrom != null && value >= rule.alertFrom) return "red";
  if (rule.alertBelow != null && value < rule.alertBelow) return "red";
  if (rule.attentionFrom != null && value >= rule.attentionFrom) return "orange";
  if (rule.attentionBelow != null && value < rule.attentionBelow) return "orange";
  return "green";
}

export const STATUS_LABEL: Record<Status, string> = {
  green: "Dentro do padrão",
  orange: "Requer análise",
  red: "Acima do limite",
  unknown: "Não localizado",
};

/** Ordem de exibição: o mais crítico primeiro. */
export const STATUS_ORDER: Record<Status, number> = { red: 0, orange: 1, unknown: 2, green: 3 };
