import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken, newInviteToken } from "./invite";
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


// ---------- equipe e convites ----------

export type Role = "admin" | "doctor";

export interface Membership {
  clinic: Clinic;
  role: Role;
}

export interface Member {
  userId: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface InviteRow {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/** Todas as clínicas do usuário, com o papel dele em cada uma. */
export async function fetchMemberships(db: SupabaseClient): Promise<Membership[]> {
  const { data, error } = await db.from("memberships").select("role, created_at, clinics(id, name)").order("created_at");
  fail(error);
  return ((data ?? []) as unknown as { role: Role; clinics: Clinic | Clinic[] | null }[])
    .map((m) => ({ role: m.role, clinic: Array.isArray(m.clinics) ? m.clinics[0] : m.clinics }))
    .filter((m): m is Membership => !!m.clinic);
}

/** Aceita o convite pelo segredo; devolve o id da clínica em que o usuário entrou. */
export async function acceptInvite(db: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await db.rpc("accept_invite", { invite_token: token });
  fail(error);
  return data as string;
}

export interface TeamApi {
  listMembers(): Promise<Member[]>;
  listInvites(): Promise<InviteRow[]>;
  /** Devolve o segredo UMA vez (ele não fica guardado em lugar nenhum). */
  createInvite(email: string, role: Role): Promise<{ token: string; expiresAt: string }>;
  revokeInvite(id: string): Promise<void>;
  setRole(userId: string, role: Role): Promise<void>;
  removeMember(userId: string): Promise<void>;
}

export function teamApi(db: SupabaseClient, clinicId: string): TeamApi {
  return {
    async listMembers() {
      const { data, error } = await db.rpc("clinic_members", { c: clinicId });
      fail(error);
      return ((data ?? []) as { user_id: string; email: string; role: Role; joined_at: string }[]).map((m) => ({
        userId: m.user_id, email: m.email, role: m.role, joinedAt: m.joined_at,
      }));
    },
    async listInvites() {
      const { data, error } = await db
        .from("invites")
        .select("id, email, role, created_at, expires_at, accepted_at")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      fail(error);
      return (data ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role as Role, createdAt: r.created_at, expiresAt: r.expires_at, acceptedAt: r.accepted_at }));
    },
    async createInvite(email, role) {
      const token = newInviteToken();
      const { data, error } = await db
        .from("invites")
        .insert({ clinic_id: clinicId, email: email.trim().toLowerCase(), role, token_hash: await hashToken(token) })
        .select("expires_at")
        .single();
      fail(error);
      return { token, expiresAt: (data as { expires_at: string }).expires_at };
    },
    async revokeInvite(id) {
      fail((await db.from("invites").delete().eq("id", id)).error);
    },
    async setRole(userId, role) {
      fail((await db.rpc("set_member_role", { c: clinicId, target: userId, new_role: role })).error);
    },
    async removeMember(userId) {
      fail((await db.rpc("remove_member", { c: clinicId, target: userId })).error);
    },
  };
}
