import { EXAMS } from "./exams";
import type { ExamDefinition } from "./types";

const KEY = "tolaris.customExams.v1";

export function catalogWith(custom: ExamDefinition[]): ExamDefinition[] {
  return [...EXAMS, ...custom];
}

/** Exames criados pelo médico (só nome/sinônimos/unidade, sem dado de paciente) ficam neste navegador. */
export function loadCustomExams(): ExamDefinition[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ExamDefinition[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomExams(list: ExamDefinition[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignora */
  }
}

/** "Vitamina C, Ácido ascórbico" -> ["Vitamina C", "Ácido ascórbico"]; sem texto, usa o próprio nome. */
export function makeCustomExam(name: string, searchText: string, unit: string): ExamDefinition {
  const aliases = searchText
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
  const cleanName = name.trim();
  return {
    id: `custom_${Math.random().toString(36).slice(2, 10)}`,
    name: cleanName,
    unit: unit.trim(),
    aliases: aliases.length ? aliases : [cleanName],
  };
}
