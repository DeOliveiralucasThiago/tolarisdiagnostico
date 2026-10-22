"use client";

import { SectionHead } from "./SectionHead";
import { evaluate, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import type { ExamDefinition, ExtractionOutput, Rule, Status } from "@/lib/types";

interface Props {
  output: ExtractionOutput;
  catalog: ExamDefinition[];
  rules: Record<string, Rule>;
  /** Valores corrigidos/digitados pelo médico, por exame. */
  overrides: Record<string, string>;
  onOverride: (examId: string, value: string) => void;
}

function describeRule(rule: Rule): string {
  const parts: string[] = [];
  if (rule.attentionFrom != null) parts.push(`laranja ≥ ${rule.attentionFrom}`);
  if (rule.attentionBelow != null) parts.push(`laranja < ${rule.attentionBelow}`);
  if (rule.alertFrom != null) parts.push(`vermelho ≥ ${rule.alertFrom}`);
  if (rule.alertBelow != null) parts.push(`vermelho < ${rule.alertBelow}`);
  return parts.join(" · ");
}

const STATS: { status: Status; label: string }[] = [
  { status: "red", label: "acima do limite" },
  { status: "orange", label: "para analisar" },
  { status: "green", label: "dentro do padrão" },
  { status: "unknown", label: "não localizados" },
];

export function Results({ output, catalog, rules, overrides, onOverride }: Props) {
  const examById = new Map(catalog.map((e) => [e.id, e]));
  const byId = new Map(output.results.map((r) => [r.examId, r]));
  const examIds = Object.keys(rules).filter((id) => examById.has(id));

  const rows = examIds
    .map((id) => {
      const found = byId.get(id);
      const override = overrides[id];
      const value = override !== undefined && override !== "" ? Number(override.replace(",", ".")) : found?.value ?? null;
      const status = evaluate(value, rules[id]);
      return { id, exam: examById.get(id)!, found, value, status };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const count = (s: Status) => rows.filter((r) => r.status === s).length;

  return (
    <section className="card">
      <SectionHead
        n={3}
        title="Resultado da análise"
        hint="Do mais crítico ao mais tranquilo. Confira os valores lidos e corrija se necessário."
      />
      <div className="stats" aria-live="polite" data-tour="summary">
        {STATS.map((s) => (
          <div key={s.status} className={`stat ${s.status}`}>
            <b>{count(s.status)}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="scroll" data-tour="table">
        <table className="results-table">
          <thead>
            <tr>
              <th>Situação</th><th>Exame</th><th>Resultado</th><th>Ref. do laboratório</th><th>Seus critérios</th><th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, exam, found, status }) => (
              <tr key={id} className={`row-${status}`}>
                <td>
                  <span className={`pill ${status}`} title={STATUS_LABEL[status]}><i className={`dot ${status}`} /><span className="pill-text">{STATUS_LABEL[status]}</span></span>
                </td>
                <td className="exam-name">{exam.name}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="value-input"
                    value={overrides[id] ?? (found ? String(found.value).replace(".", ",") : "")}
                    placeholder="—"
                    onChange={(e) => onOverride(id, e.target.value)}
                    aria-label={`Resultado de ${exam.name}`}
                  />
                  <span className="unit">{found?.unit ?? exam.unit}</span>
                  {found?.qualifier && <span className="unit">({found.raw})</span>}
                </td>
                <td className="muted">{found?.labReference ?? "—"}</td>
                <td className="muted">{describeRule(rules[id])}</td>
                <td>
                  {found ? (
                    <details>
                      <summary>pág. {found.source.page}</summary>
                      <div className="src">{found.source.text}</div>
                    </details>
                  ) : (
                    <span className="muted">não localizado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted disclaimer">
        Exames não localizados nunca aparecem como verdes. Se um valor foi lido errado, digite o correto no campo.
      </p>
    </section>
  );
}
