import type { Rule, RuleVariant, Sex, Status, Thresholds } from "./types";

export interface PatientContext {
  sex?: Sex;
  /** Idade em anos (na data do exame, quando conhecida). */
  age?: number | null;
}

export interface AppliedRule {
  /** Limites que valem para este paciente; null quando não dá para avaliar. */
  thresholds: Thresholds | null;
  /** "Mulheres", "Homens, 18–40 anos", "Geral"… (só quando o exame tem faixas por sexo/idade). */
  label?: string;
  /** Existe faixa específica que não pôde ser aplicada por falta deste dado do paciente. */
  missing?: "sexo" | "idade";
}

export const hasThresholds = (t: Thresholds | undefined): boolean =>
  !!t && (t.attentionFrom != null || t.alertFrom != null || t.attentionBelow != null || t.alertBelow != null);

export function variantLabel(v: RuleVariant): string {
  const parts: string[] = [];
  if (v.sex) parts.push(v.sex === "M" ? "Homens" : "Mulheres");
  if (v.ageMin != null && v.ageMax != null) parts.push(`${v.ageMin}–${v.ageMax} anos`);
  else if (v.ageMin != null) parts.push(`${v.ageMin} anos ou mais`);
  else if (v.ageMax != null) parts.push(`até ${v.ageMax} anos`);
  return parts.join(", ") || "Todos";
}

/**
 * Escolhe os limites que valem para o paciente: a primeira variante (na ordem definida pelo médico) que
 * combina com o sexo e a idade; se nenhuma combina, os limites gerais. Nunca adivinha um dado que falta:
 * variante que exige sexo/idade desconhecidos é pulada e fica registrado o que faltou.
 */
export function resolveRule(rule: Rule | undefined, ctx: PatientContext = {}): AppliedRule {
  if (!rule) return { thresholds: null };
  const variants = rule.variants ?? [];
  let missing: AppliedRule["missing"];
  for (const v of variants) {
    if (v.sex && !ctx.sex) { missing ??= "sexo"; continue; }
    if (v.sex && v.sex !== ctx.sex) continue;
    const needsAge = v.ageMin != null || v.ageMax != null;
    if (needsAge && ctx.age == null) { missing ??= "idade"; continue; }
    if (v.ageMin != null && ctx.age! < v.ageMin) continue;
    if (v.ageMax != null && ctx.age! > v.ageMax) continue;
    return { thresholds: v, label: variantLabel(v) };
  }
  if (hasThresholds(rule)) return { thresholds: rule, label: variants.length ? "Geral" : undefined, missing };
  return { thresholds: null, missing };
}

export function evaluate(value: number | null | undefined, rule: Rule | undefined, ctx: PatientContext = {}): Status {
  if (value == null || Number.isNaN(value) || !rule) return "unknown";
  const t = resolveRule(rule, ctx).thresholds;
  // sem nenhuma faixa aplicável (ou definida): nada a avaliar, e nunca pode virar "verde"
  if (!t || !hasThresholds(t)) return "unknown";
  if (t.alertFrom != null && value >= t.alertFrom) return "red";
  if (t.alertBelow != null && value < t.alertBelow) return "red";
  if (t.attentionFrom != null && value >= t.attentionFrom) return "orange";
  if (t.attentionBelow != null && value < t.attentionBelow) return "orange";
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
