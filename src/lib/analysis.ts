import { extractResults } from "./extract";
import { evaluate, STATUS_ORDER } from "./status";
import type { ExamDefinition, ExtractedResult, Rule, Status, TextItem } from "./types";

export interface AnalysisRow {
  id: string;
  exam: ExamDefinition;
  rule: Rule;
  found?: ExtractedResult;
  value: number | null;
  status: Status;
}

export interface Analysis {
  /** Do mais crítico ao menos crítico. */
  rows: AnalysisRow[];
  counts: Record<Status, number>;
  /** Pior situação do paciente: vermelho > laranja > não localizado > verde. */
  worst: Status;
}

/** Aplica os critérios do preset aos exames lidos de UM laudo. `overrides` são valores corrigidos pelo médico. */
export function analyze(
  items: TextItem[],
  rules: Record<string, Rule>,
  catalog: ExamDefinition[],
  overrides: Record<string, string> = {},
): Analysis {
  const examById = new Map(catalog.map((e) => [e.id, e]));
  const ids = Object.keys(rules).filter((id) => examById.has(id));
  const byId = new Map(extractResults(items, ids, catalog).results.map((r) => [r.examId, r]));

  const rows = ids
    .map((id) => {
      const found = byId.get(id);
      const override = overrides[id];
      const value = override !== undefined && override !== "" ? Number(override.replace(",", ".")) : found?.value ?? null;
      return { id, exam: examById.get(id)!, rule: rules[id], found, value, status: evaluate(value, rules[id]) };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const counts: Record<Status, number> = { red: 0, orange: 0, green: 0, unknown: 0 };
  for (const r of rows) counts[r.status]++;
  const worst = (Object.keys(counts) as Status[]).filter((s) => counts[s] > 0).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])[0] ?? "unknown";
  return { rows, counts, worst };
}
