"use client";

import { evaluate, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import type { ExamDefinition, ExtractionOutput, Rule } from "@/lib/types";

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

  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <section className="card">
      <h2>3. Resultado da análise</h2>
      <div className="summary" aria-live="polite">
        <span><i className="dot red" /> {count("red")} acima do limite</span>
        <span><i className="dot orange" /> {count("orange")} para analisar</span>
        <span><i className="dot green" /> {count("green")} dentro do padrão</span>
        <span><i className="dot unknown" /> {count("unknown")} não localizados</span>
      </div>
      <p className="muted">
        Confira os valores lidos. Se algum exame não foi localizado (cinza), digite o valor manualmente.
        Ferramenta de apoio à triagem: a decisão clínica é do médico.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th></th><th>Exame</th><th>Resultado</th><th>Ref. do laboratório</th><th>Seus critérios</th><th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, exam, found, status }) => (
              <tr key={id}>
                <td><i className={`dot ${status}`} title={STATUS_LABEL[status]} role="img" aria-label={STATUS_LABEL[status]} /></td>
                <td>{exam.name}</td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={{ width: 90 }}
                    value={overrides[id] ?? (found ? String(found.value).replace(".", ",") : "")}
                    placeholder="—"
                    onChange={(e) => onOverride(id, e.target.value)}
                    aria-label={`Resultado de ${exam.name}`}
                  />{" "}
                  <span className="muted">{found?.unit ?? exam.unit}</span>
                  {found?.qualifier && <span className="muted"> ({found.raw})</span>}
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
    </section>
  );
}
