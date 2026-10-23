"use client";

import { SectionHead } from "./SectionHead";
import type { Analysis } from "@/lib/analysis";
import { STATUS_LABEL } from "@/lib/status";
import type { Rule, Status } from "@/lib/types";

interface Props {
  analysis: Analysis;
  /** Valores corrigidos/digitados pelo médico, por exame. */
  overrides: Record<string, string>;
  onOverride: (examId: string, value: string) => void;
  /** Dentro da lista de pacientes: sem cartão e sem título de seção. */
  embedded?: boolean;
  /** Cabeçalho do paciente (modo de um único laudo). */
  header?: React.ReactNode;
}

export function describeRule(rule: Rule): string {
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

export function Results({ analysis, overrides, onOverride, embedded = false, header }: Props) {
  const { rows, counts } = analysis;
  const tour = (name: string) => (embedded ? undefined : name);

  const body = (
    <>
      <div className="stats" aria-live="polite" data-tour={tour("summary")}>
        {STATS.map((s) => (
          <div key={s.status} className={`stat ${s.status}`}>
            <b>{counts[s.status]}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="scroll" data-tour={tour("table")}>
        <table className="results-table">
          <thead>
            <tr>
              <th>Situação</th><th>Exame</th><th>Resultado</th><th>Ref. do laboratório</th><th>Seus critérios</th><th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, exam, rule, found, status, alternatives }) => (
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
                  {alternatives && (
                    <div className="repeated" title="O mesmo exame veio em mais de um arquivo com valores diferentes. Vale o do primeiro arquivo enviado; confira.">
                      <span className="badge">valor repetido</span>{" "}
                      {alternatives.map((a) => `${String(a.value).replace(".", ",")} em ${a.file}`).join("; ")}
                    </div>
                  )}
                </td>
                <td className="muted">{found?.labReference ?? "—"}</td>
                <td className="muted">{describeRule(rule)}</td>
                <td>
                  {found ? (
                    <details>
                      <summary>pág. {found.source.page}{found.source.file ? ` · ${found.source.file}` : ""}</summary>
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
    </>
  );

  if (embedded) return <div className="detail-body">{body}</div>;

  return (
    <section className="card">
      <SectionHead n={3} title="Resultado da análise" hint="Do mais crítico ao mais tranquilo. Confira os valores lidos e corrija se necessário." />
      {header}
      {body}
    </section>
  );
}
