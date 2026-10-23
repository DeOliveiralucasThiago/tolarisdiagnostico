"use client";

import { useMemo, useState } from "react";
import { IconDownload, IconX } from "./Icons";
import { Results } from "./Results";
import { SectionHead } from "./SectionHead";
import type { Analysis, AnalysisRow } from "@/lib/analysis";
import { filterAndSort, type BatchFilters, type BatchItem, type StatusFilter } from "@/lib/batch";
import { copyText } from "@/lib/clipboard";
import type { Suggestion } from "@/lib/grouping";
import { formatName } from "@/lib/patient";
import { buildBatchCsv, buildSummaryText, csvFileName, type ExportPatient } from "@/lib/export";
import { STATUS_LABEL } from "@/lib/status";
import type { ExamDefinition, Status } from "@/lib/types";

export interface PatientRow extends BatchItem {
  /** "33 anos" etc. */
  subtitle: string;
  /** Motivo, quando o PDF não pôde ser analisado. */
  problem?: string;
  birth?: string;
  age?: number | null;
  /** Arquivos reunidos neste paciente (mais de um quando os exames vieram em PDFs separados). */
  members: { id: string; fileName: string }[];
  /** Algum arquivo foi lido por reconhecimento de imagem (OCR). */
  ocr: boolean;
}

/** Aviso para laudos lidos por OCR (foto ou escaneado): números podem vir errados. */
export function OcrNotice() {
  return (
    <p className="ocr-warning" role="note">
      <strong>Lido por reconhecimento de imagem (OCR).</strong> Esse método pode errar números e letras (por exemplo, 5,9 lido como 59).
      Confira cada valor com o laudo original antes de decidir.
    </p>
  );
}

/** Lista os arquivos reunidos em um paciente, com opção de separar. */
export function MembersList({ members, onSeparate }: { members: { id: string; fileName: string }[]; onSeparate: (memberId: string) => void }) {
  if (members.length < 2) return null;
  return (
    <div className="members">
      <span className="muted">Arquivos reunidos neste paciente:</span>
      {members.map((m) => (
        <span key={m.id} className="file-pill">
          {m.fileName}
          <button className="small ghost" onClick={() => onSeparate(m.id)} title="Tratar este arquivo como outro paciente">Separar</button>
        </span>
      ))}
    </div>
  );
}

export const toExport = (p: PatientRow): ExportPatient => ({
  label: p.label, birth: p.birth, age: p.age, fileName: p.fileName, analysis: p.analysis, problem: p.problem, ocr: p.ocr,
});

interface Props {
  patients: PatientRow[];
  /** Exames configurados no preset (filtro por exame e colunas da planilha). */
  exams: ExamDefinition[];
  presetName: string;
  suggestions: Suggestion[];
  onMerge: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
  onSeparate: (memberId: string) => void;
  onPrint: (kind: "patient" | "batch", ids: string[]) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  overrides: Record<string, Record<string, string>>;
  onOverride: (patientId: string, examId: string, value: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

const DEFAULT_FILTERS: BatchFilters = { status: "all", query: "", examId: "", sort: "critical" };

const CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "red", label: "Acima do limite" },
  { value: "orange", label: "Para analisar" },
  { value: "green", label: "Tudo normal" },
  { value: "unknown", label: "Não localizados" },
];

const STATS: { status: Status; label: string }[] = [
  { status: "red", label: "com exames acima do limite" },
  { status: "orange", label: "para analisar" },
  { status: "unknown", label: "com exames não localizados" },
  { status: "green", label: "tudo dentro do padrão" },
];

function attentionText(a: Analysis): string {
  const flagged = a.rows.filter((r: AnalysisRow) => r.status === "red" || r.status === "orange");
  if (!flagged.length) return "—";
  const fmt = (r: AnalysisRow) => `${r.exam.name} ${String(r.value).replace(".", ",")}`;
  const shown = flagged.slice(0, 3).map(fmt).join(" · ");
  return flagged.length > 3 ? `${shown} · +${flagged.length - 3}` : shown;
}

export function PatientsPanel({ patients, exams, presetName, suggestions, onMerge, onDismiss, onSeparate, onPrint, expanded, onToggle, overrides, onOverride, onRemove, onClear }: Props) {
  const [filters, setFilters] = useState<BatchFilters>(DEFAULT_FILTERS);
  const visible = useMemo(() => filterAndSort(patients, filters), [patients, filters]);

  const byWorst = (s: Status) => patients.filter((p) => p.analysis?.worst === s).length;
  const unreadable = patients.filter((p) => !p.analysis).length;
  const chipCount = (v: StatusFilter) => filterAndSort(patients, { ...DEFAULT_FILTERS, status: v }).length;
  const [copied, setCopied] = useState<string | null>(null);

  const downloadCsv = () => {
    const blob = new Blob([buildBatchCsv(visible.map(toExport), exams)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copySummary = async (p: PatientRow) => {
    if (await copyText(buildSummaryText(toExport(p), presetName))) {
      setCopied(p.id);
      setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 2500);
    }
  };

  const filtered = filters.status !== "all" || filters.query !== "" || filters.examId !== "";

  return (
    <section className="card">
      <SectionHead
        n={3}
        title={`Resultado da análise · ${patients.length} pacientes`}
        hint="Do mais crítico ao mais tranquilo. Abra um paciente para conferir os valores e corrigir, se necessário."
        right={
          <div className="row">
            <button className="small" onClick={downloadCsv} disabled={visible.length === 0} title="Abre direto no Excel">
              <IconDownload width={16} height={16} /> Baixar planilha ({visible.length})
            </button>
            <button className="small" onClick={() => onPrint("batch", visible.map((p) => p.id))} disabled={visible.length === 0}>Imprimir / PDF</button>
            <button className="small ghost" onClick={onClear}>Limpar tudo</button>
          </div>
        }
      />

      {suggestions.length > 0 && (
        <div className="suggestions" role="status">
          {suggestions.map((sg) => {
            const side = (g: Suggestion["a"]) => `${g.members.map((m) => m.fileName).join(" + ")} (${g.birth ? `nasc. ${g.birth}` : "sem data de nascimento"})`;
            return (
              <div key={sg.key} className="suggestion">
                <div>
                  <strong>Possível mesmo paciente: {formatName(sg.a.name!)}.</strong>{" "}
                  <span className="muted">{side(sg.a)} e {side(sg.b)}. Se os exames de um forem de um PDF e os do outro de outro, una para ver tudo junto.</span>
                </div>
                <div className="row">
                  <button className="small primary" onClick={() => onMerge(sg)}>Unir</button>
                  <button className="small" onClick={() => onDismiss(sg)}>São pessoas diferentes</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="stats" aria-live="polite" data-tour="summary">
        {STATS.map((s) => (
          <div key={s.status} className={`stat ${s.status}`}>
            <b>{byWorst(s.status)}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="filters" data-tour="filters">
        <div className="chips" role="group" aria-label="Filtrar por situação">
          {CHIPS.map((c) => (
            <button
              key={c.value}
              className={`chip-btn${filters.status === c.value ? " on" : ""}`}
              aria-pressed={filters.status === c.value}
              onClick={() => setFilters((f) => ({ ...f, status: c.value }))}
            >
              {c.label} <span className="count">{chipCount(c.value)}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <input
            type="text"
            placeholder="Buscar paciente…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-label="Buscar paciente"
          />
          <select value={filters.examId} onChange={(e) => setFilters((f) => ({ ...f, examId: e.target.value }))} aria-label="Filtrar por exame alterado">
            <option value="">Qualquer exame</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>Alterado: {e.name}</option>
            ))}
          </select>
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as BatchFilters["sort"] }))} aria-label="Ordenar">
            <option value="critical">Mais críticos primeiro</option>
            <option value="name">Nome (A–Z)</option>
          </select>
          {filtered && <button className="small ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros</button>}
        </div>
      </div>

      <div className="scroll" data-tour="table">
        <table className="patients-table">
          <thead>
            <tr>
              <th>Paciente</th><th>Situação geral</th><th>Exames</th><th>Para atenção</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={5} className="muted">Nenhum paciente corresponde aos filtros.</td></tr>
            )}
            {visible.map((p, idx) => {
              const a = p.analysis;
              const isOpen = expanded.has(p.id);
              const row = p as PatientRow;
              return [
                <tr key={p.id} className={a ? `row-${a.worst}` : "row-unknown"}>
                  <td>
                    <div className="patient-name">{p.label}{row.ocr && <span className="badge" title="Lido por reconhecimento de imagem (OCR): confira os valores"> OCR</span>}{a?.rows.some((r) => r.suspect) && <span className="badge" title="Há valores que destoam da faixa do laboratório: provável erro de leitura"> ⚠ conferir</span>}</div>
                    <div className="muted">{[row.subtitle, p.fileName].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    {a ? (
                      <span className={`pill ${a.worst}`}><i className={`dot ${a.worst}`} />{a.worst === "unknown" ? "Exames não localizados" : STATUS_LABEL[a.worst]}</span>
                    ) : (
                      <span className="pill unknown"><i className="dot unknown" />Não lido</span>
                    )}
                  </td>
                  <td>
                    {a ? (
                      <span className="mini-counts" title="vermelhos · laranjas · verdes · não localizados">
                        <span className="mc red">{a.counts.red}</span>
                        <span className="mc orange">{a.counts.orange}</span>
                        <span className="mc green">{a.counts.green}</span>
                        <span className="mc unknown">{a.counts.unknown}</span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="attention">{a ? attentionText(a) : <span className="err">{row.problem}</span>}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {a && (
                      <button className="small" onClick={() => onToggle(p.id)} aria-expanded={isOpen}>
                        {isOpen ? "Ocultar" : "Ver detalhes"}
                      </button>
                    )}{" "}
                    <button className="small ghost" onClick={() => onRemove(p.id)} title="Remover da lista" aria-label={`Remover ${p.label}`}>
                      <IconX width={14} height={14} />
                    </button>
                  </td>
                </tr>,
                a && isOpen ? (
                  <tr key={`${p.id}-detail`} className="detail-row">
                    <td colSpan={5} data-tour={idx === 0 ? "detail" : undefined}>
                      {row.ocr && <OcrNotice />}
                      <MembersList members={row.members} onSeparate={onSeparate} />
                      <div className="detail-actions">
                        <button className="small" onClick={() => copySummary(row)}>{copied === p.id ? "✓ Resumo copiado" : "Copiar resumo"}</button>
                        <button className="small" onClick={() => onPrint("patient", [p.id])}>Imprimir / PDF</button>
                      </div>
                      <Results
                        embedded
                        analysis={a}
                        overrides={overrides[p.id] ?? {}}
                        onOverride={(examId, v) => onOverride(p.id, examId, v)}
                      />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="muted disclaimer">
        {unreadable > 0 && `${unreadable} arquivo(s) não puderam ser lidos. `}
        Exames não localizados nunca aparecem como verdes. Os dados ficam só neste navegador e somem ao recarregar a página.
      </p>
    </section>
  );
}
