import type { SupabaseClient } from "@supabase/supabase-js";
import type { Preset } from "./presets";
import type { ExamDefinition, Rule } from "./types";

export interface Clinic {
  id: string;
  name: string;
}

export interface Workspace {
  presets: Preset[];
  customExams: ExamDefinition[];
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Clínica do usuário logado (uma por usuário nesta versão). */
export async function fetchClinic(db: SupabaseClient): Promise<Clinic | null> {
  const { data, error } = await db.from("clinics").select("id, name").order("created_at").limit(1);
  fail(error);
  return data?.[0] ?? null;
}

export async function createClinic(db: SupabaseClient, name: string): Promise<Clinic> {
  const { data, error } = await db.rpc("create_clinic", { clinic_name: name });
  fail(error);
  return { id: data as string, name: name.trim() };
}

export async function fetchWorkspace(db: SupabaseClient, clinicId: string): Promise<Workspace> {
  const [presets, exams] = await Promise.all([
    db.from("presets").select("id, name, rules").eq("clinic_id", clinicId).order("updated_at"),
    db.from("custom_exams").select("id, name, unit, aliases").eq("clinic_id", clinicId),
  ]);
  fail(presets.error);
  fail(exams.error);
  return {
    presets: (presets.data ?? []).map((p) => ({ id: p.id, name: p.name, rules: p.rules as Record<string, Rule> })),
    customExams: (exams.data ?? []).map((e) => ({ id: e.id, name: e.name, unit: e.unit, aliases: e.aliases })),
  };
}

/** Grava só o que mudou desde a última sincronização (inclui remoções). */
export function diffById<T extends { id: string }>(prev: T[], next: T[]): { upsert: T[]; remove: string[] } {
  const before = new Map(prev.map((x) => [x.id, JSON.stringify(x)]));
  const upsert = next.filter((x) => before.get(x.id) !== JSON.stringify(x));
  const kept = new Set(next.map((x) => x.id));
  return { upsert, remove: prev.filter((x) => !kept.has(x.id)).map((x) => x.id) };
}

export async function syncPresets(db: SupabaseClient, clinicId: string, prev: Preset[], next: Preset[]): Promise<void> {
  const { upsert, remove } = diffById(prev, next);
  if (upsert.length) {
    const rows = upsert.map((p) => ({ id: p.id, clinic_id: clinicId, name: p.name, rules: p.rules, updated_at: new Date().toISOString() }));
    fail((await db.from("presets").upsert(rows)).error);
  }
  if (remove.length) fail((await db.from("presets").delete().eq("clinic_id", clinicId).in("id", remove)).error);
}

export async function syncCustomExams(db: SupabaseClient, clinicId: string, prev: ExamDefinition[], next: ExamDefinition[]): Promise<void> {
  const { upsert, remove } = diffById(prev, next);
  if (upsert.length) {
    const rows = upsert.map((e) => ({ clinic_id: clinicId, id: e.id, name: e.name, unit: e.unit, aliases: e.aliases }));
    fail((await db.from("custom_exams").upsert(rows)).error);
  }
  if (remove.length) fail((await db.from("custom_exams").delete().eq("clinic_id", clinicId).in("id", remove)).error);
}
