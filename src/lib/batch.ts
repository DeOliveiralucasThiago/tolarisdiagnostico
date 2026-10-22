import type { Analysis } from "./analysis";
import { STATUS_ORDER } from "./status";

export type StatusFilter = "all" | "attention" | "red" | "orange" | "green" | "unknown";
export type SortBy = "critical" | "name";

export interface BatchFilters {
  status: StatusFilter;
  /** Texto livre: nome do paciente ou do arquivo. */
  query: string;
  /** Só pacientes com este exame em laranja ou vermelho. */
  examId: string;
  sort: SortBy;
}

export interface BatchItem {
  id: string;
  label: string; // nome exibido (ou arquivo)
  fileName: string;
  analysis: Analysis | null; // null = não foi possível ler
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matchesStatus(a: Analysis, f: StatusFilter): boolean {
  switch (f) {
    case "all": return true;
    case "attention": return a.counts.red > 0 || a.counts.orange > 0;
    case "red": return a.counts.red > 0;
    case "orange": return a.counts.orange > 0;
    case "green": return a.worst === "green";
    case "unknown": return a.counts.unknown > 0;
  }
}

export function filterAndSort<T extends BatchItem>(list: T[], f: BatchFilters): T[] {
  const q = plain(f.query.trim());
  const out = list.filter((p) => {
    if (q && !plain(`${p.label} ${p.fileName}`).includes(q)) return false;
    if (f.status !== "all" && (!p.analysis || !matchesStatus(p.analysis, f.status))) return false;
    if (f.examId) {
      const row = p.analysis?.rows.find((r) => r.id === f.examId);
      if (!row || (row.status !== "red" && row.status !== "orange")) return false;
    }
    return true;
  });
  return out.sort((a, b) => {
    if (f.sort === "name") return a.label.localeCompare(b.label, "pt-BR");
    // arquivos ilegíveis vão para o fim
    if (!a.analysis || !b.analysis) return Number(!a.analysis) - Number(!b.analysis);
    return (
      STATUS_ORDER[a.analysis.worst] - STATUS_ORDER[b.analysis.worst] ||
      b.analysis.counts.red - a.analysis.counts.red ||
      b.analysis.counts.orange - a.analysis.counts.orange ||
      a.label.localeCompare(b.label, "pt-BR")
    );
  });
}
