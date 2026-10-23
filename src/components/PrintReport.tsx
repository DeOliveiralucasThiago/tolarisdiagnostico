import type { PatientRow } from "./PatientsPanel";
import { attentionList } from "@/lib/export";
import { STATUS_LABEL } from "@/lib/status";
import { describeRule } from "./Results";

export type PrintJob = { kind: "patient" | "batch"; ids: string[] };

interface Props {
  job: PrintJob;
  rows: PatientRow[];
  presetName: string;
  date: Date;
}

const dec = (n: number | null) => (n == null ? "" : Math.abs(n) >= 1000 ? n.toLocaleString("pt-BR") : String(n).replace(".", ","));

/** Relatório mostrado só na impressão / "Salvar como PDF". Fica oculto na tela. */
export function PrintReport({ job, rows, presetName, date }: Props) {
  const list = job.ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is PatientRow => !!r);
  return (
    <div className="print-report">
      <header>
        <h1>Tolaris Diagnóstico · Triagem de exames</h1>
        <p>{date.toLocaleDateString("pt-BR")} · Critérios: {presetName}</p>
      </header>

      {job.kind === "batch" ? (
        <table>
          <thead>
            <tr><th>Paciente</th><th>Situação geral</th><th>Vermelhos / Laranjas / Verdes / Não loc.</th><th>Para atenção</th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.label}</strong><br />{[p.subtitle, p.fileName].filter(Boolean).join(" · ")}</td>
                <td>{p.analysis ? (p.analysis.worst === "unknown" ? "Exames não localizados" : STATUS_LABEL[p.analysis.worst]) : "Não lido"}</td>
                <td>{p.analysis ? `${p.analysis.counts.red} / ${p.analysis.counts.orange} / ${p.analysis.counts.green} / ${p.analysis.counts.unknown}` : "—"}</td>
                <td>{p.analysis ? attentionList(p.analysis) || "—" : p.problem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        list.map((p) => (
          <section key={p.id}>
            <h2>{p.label}{p.subtitle ? ` · ${p.subtitle}` : ""}</h2>
            <p>Arquivo: {p.fileName}</p>
            {p.analysis ? (
              <table>
                <thead>
                  <tr><th>Situação</th><th>Exame</th><th>Resultado</th><th>Ref. do laboratório</th><th>Critérios</th></tr>
                </thead>
                <tbody>
                  {p.analysis.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td>{r.exam.name}</td>
                      <td>{r.value != null ? `${dec(r.value)} ${r.found?.unit ?? r.exam.unit}` : "—"}</td>
                      <td>{r.found?.labReference ?? "—"}</td>
                      <td>{describeRule(r.rule)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Não foi possível ler o laudo: {p.problem}</p>
            )}
          </section>
        ))
      )}
      <footer>Resultados lidos automaticamente do laudo; a conferência e a interpretação clínica são do médico.</footer>
    </div>
  );
}
