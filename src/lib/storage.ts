import { loadCustomExams, saveCustomExams } from "./custom-exams";
import { createClinic, fetchWorkspace, syncCustomExams, syncPresets, type Clinic, type Workspace } from "./cloud-store";
import { loadPresets, savePresets, type Preset } from "./presets";
import { getSupabase } from "./supabase";
import type { ExamDefinition } from "./types";

/** Onde os critérios (presets e exames personalizados) ficam salvos. Nunca dados de pacientes. */
export interface Storage {
  load(): Promise<Workspace>;
  savePresets(prev: Preset[], next: Preset[]): Promise<void>;
  saveCustomExams(prev: ExamDefinition[], next: ExamDefinition[]): Promise<void>;
}

export const localStorageAdapter: Storage = {
  async load() {
    return { presets: loadPresets(), customExams: loadCustomExams() };
  },
  async savePresets(_prev, next) {
    savePresets(next);
  },
  async saveCustomExams(_prev, next) {
    saveCustomExams(next);
  },
};

export function cloudStorage(clinic: Clinic): Storage {
  const db = getSupabase();
  return {
    load: () => fetchWorkspace(db, clinic.id),
    savePresets: (prev, next) => syncPresets(db, clinic.id, prev, next),
    saveCustomExams: (prev, next) => syncCustomExams(db, clinic.id, prev, next),
  };
}

export { createClinic };
