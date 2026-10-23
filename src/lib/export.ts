import type { Analysis, AnalysisRow } from "./analysis";
import { STATUS_LABEL } from "./status";
import type { ExamDefinition, Sex, Status } from "./types";

export interface ExportPatient {
  label: string;
  birth?: string;
  age?: number | null;
  fileName: string;
  analysis: Analysis | null;
  /** Motivo, quando o PDF não pôde ser lido. */
  problem?: string;
  /** Lido por reconhecimento de imagem (OCR). */
  ocr?: boolean;
  sex?: Sex;
}

const sexName = (s?: Sex) => (s === "M" ? "Masculino" : s === "F" ? "Feminino" : "");
const dec = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "" : String(n).replace(".", ","));
const unitOf = (r: AnalysisRow) => r.found?.unit ?? r.exam.unit;
const overall = (s: Status) => (s === "unknown" ? "Exames não localizados" : STATUS_LABEL[s]);

/**
 * Textos vindos do PDF não são confiáveis: uma célula começando com = + - @ pode virar fórmula no Excel.
 * O apóstrofo faz o Excel tratá-la como texto.
 */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function attentionList(a: Analysis): string {
  return a.rows
    .filter((r) => r.status === "red" || r.status === "orange")
    .map((r) => `${r.exam.name} ${dec(r.value)}`)
    .join(" | ");
}

/**
 * Planilha do lote em CSV com ";" e BOM UTF-8: abre direto no Excel em português, com acentos corretos.
 * Uma linha por paciente; para cada exame do preset, o valor e a situação.
 */
export function buildBatchCsv(patients: ExportPatient[], exams: ExamDefinition[]): string {
  const head = [
    "Paciente", "Data de nascimento", "Idade", "Sexo", "Arquivo", "Leitura", "Situação geral", "Vermelhos", "Laranjas", "Verdes", "Não localizados", "Para atenção",
    ...exams.flatMap((e) => [`${e.name}${e.unit ? ` (${e.unit})` : ""}`, `${e.name} - situação`]),
  ];
  const lines = [head.map(csvCell).join(";")];

  for (const p of patients) {
    const a = p.analysis;
    const cells: string[] = [
      safeText(p.label), p.birth ?? "", p.age != null ? String(p.age) : "", sexName(p.sex), safeText(p.fileName),
      p.ocr ? "OCR (conferir)" : "Texto do PDF",
      a ? overall(a.worst) : "Não lido",
      a ? String(a.counts.red) : "", a ? String(a.counts.orange) : "", a ? String(a.counts.green) : "", a ? String(a.counts.unknown) : "",
      a ? safeText(attentionList(a)) : safeText(p.problem ?? ""),
    ];
    for (const e of exams) {
      const row = a?.rows.find((r) => r.id === e.id);
      cells.push(row ? dec(row.value) : "", row ? STATUS_LABEL[row.status] : a ? "" : "Não lido");
    }
    lines.push(cells.map(csvCell).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvFileName(date: Date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `tolaris-triagem-${d}.csv`;
}

/** Resumo em texto de UM paciente, para colar no ASO ou em outro sistema. */
export function buildSummaryText(p: ExportPatient, presetName: string, date: Date = new Date()): string {
  const extra = [p.age != null ? `${p.age} anos` : "", sexName(p.sex).toLowerCase()].filter(Boolean).join(", ");
  const who = extra ? `${p.label} (${extra})` : p.label;
  const out = [`Triagem de exames: ${who}`, `Data: ${date.toLocaleDateString("pt-BR")} · Critérios: ${presetName}`, ""];
  if (!p.analysis) {
    out.push(`Não foi possível ler o laudo (${p.fileName}): ${p.problem ?? "erro desconhecido"}`);
  } else {
    const fmt = (r: AnalysisRow, tag: string) => `• ${r.exam.name}: ${dec(r.value)} ${unitOf(r)}${tag}`.replace(/\s+$/, "");
    const by = (s: Status) => p.analysis!.rows.filter((r) => r.status === s);
    const section = (title: string, rows: AnalysisRow[], tag: (r: AnalysisRow) => string) => {
      if (rows.length) out.push(title, ...rows.map((r) => fmt(r, tag(r))), "");
    };
    section("ACIMA DO LIMITE", by("red"), () => "");
    section("PARA ANÁLISE", by("orange"), () => "");
    section("DENTRO DO PADRÃO", by("green"), () => "");
    const missing = by("unknown");
    if (missing.length) out.push("NÃO LOCALIZADOS NO LAUDO", ...missing.map((r) => `• ${r.exam.name}`), "");
  }
  if (p.ocr) out.push("Atenção: laudo lido por reconhecimento de imagem (OCR), que pode errar números. Confira com o original.");
  out.push("Resultados lidos automaticamente do laudo; a conferência e a interpretação clínica são do médico.");
  return out.join("\n");
}
