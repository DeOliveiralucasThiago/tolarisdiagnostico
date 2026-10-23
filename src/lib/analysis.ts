import { extractResults } from "./extract";
import { evaluate, STATUS_ORDER } from "./status";
import type { ExamDefinition, ExtractedResult, Rule, Status, TextItem } from "./types";

export interface AnalysisRow {
  id: string;
  exam: ExamDefinition;
  rule: Rule;
  found?: ExtractedResult;
  /** Mesmo exame em outro arquivo do mesmo paciente, com valor diferente (vale o do primeiro arquivo). */
  alternatives?: { value: number; raw: string; file: string }[];
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

export interface SourceFile {
  fileName: string;
  items: TextItem[];
}

/**
 * Aplica os critérios do preset a UM paciente, que pode ter vários arquivos (ex.: glicemia num PDF e
 * hemoglobina em outro). Cada exame vem do primeiro arquivo em que aparece; se outro arquivo trouxer o
 * mesmo exame com valor diferente, o valor fica em `alternatives` para o médico decidir.
 * `overrides` são valores corrigidos pelo médico.
 */
export function analyzeFiles(
  files: SourceFile[],
  rules: Record<string, Rule>,
  catalog: ExamDefinition[],
  overrides: Record<string, string> = {},
): Analysis {
  const examById = new Map(catalog.map((e) => [e.id, e]));
  const ids = Object.keys(rules).filter((id) => examById.has(id));
  const perFile = files.map((f) => new Map(extractResults(f.items, ids, catalog).results.map((r) => [r.examId, r])));
  const multi = files.length > 1;

  const rows = ids
    .map((id) => {
      const hits = perFile.flatMap((m, i) => (m.has(id) ? [{ r: m.get(id)!, file: files[i].fileName }] : []));
      const first = hits[0];
      const found = first ? { ...first.r, source: { ...first.r.source, file: multi ? first.file : undefined } } : undefined;
      const alternatives = first
        ? hits.slice(1).filter((h) => h.r.value !== first.r.value).map((h) => ({ value: h.r.value, raw: h.r.raw, file: h.file }))
        : [];
      const override = overrides[id];
      const value = override !== undefined && override !== "" ? Number(override.replace(",", ".")) : found?.value ?? null;
      return { id, exam: examById.get(id)!, rule: rules[id], found, alternatives: alternatives.length ? alternatives : undefined, value, status: evaluate(value, rules[id]) };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const counts: Record<Status, number> = { red: 0, orange: 0, green: 0, unknown: 0 };
  for (const r of rows) counts[r.status]++;
  const worst = (Object.keys(counts) as Status[]).filter((s) => counts[s] > 0).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])[0] ?? "unknown";
  return { rows, counts, worst };
}

/** Atalho para um único laudo. */
export function analyze(
  items: TextItem[],
  rules: Record<string, Rule>,
  catalog: ExamDefinition[],
  overrides: Record<string, string> = {},
): Analysis {
  return analyzeFiles([{ fileName: "", items }], rules, catalog, overrides);
}
