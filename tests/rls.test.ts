import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Roda a migração em um Postgres de verdade (PGlite) com stubs do esquema `auth` do Supabase
 * e verifica o isolamento entre clínicas com os papéis `authenticated` e `anon`.
 */
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

let db: PGlite;

async function as(user: string | null, fn: () => Promise<unknown>) {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ""}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(path.resolve(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
});

describe("RLS: isolamento entre clínicas", () => {
  let clinicA = "";
  let clinicB = "";

  it("create_clinic cria a clínica e torna o usuário membro", async () => {
    clinicA = (await as(A, async () => (await db.query<{ id: string }>("select public.create_clinic('Clínica A') as id")).rows[0].id)) as string;
    clinicB = (await as(B, async () => (await db.query<{ id: string }>("select public.create_clinic('Clínica B') as id")).rows[0].id)) as string;
    const rows = (await as(A, async () => (await db.query("select * from public.clinics")).rows)) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it("membro grava e lê presets da própria clínica", async () => {
    await as(A, () => db.query(`insert into public.presets (id, clinic_id, name, rules) values ('p1', '${clinicA}', 'Meu', '{"glicose":{"alertFrom":20}}')`));
    const rows = (await as(A, async () => (await db.query("select id from public.presets")).rows)) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it("outra clínica não enxerga nem altera presets alheios", async () => {
    expect(((await as(B, async () => (await db.query("select * from public.presets")).rows)) as unknown[]).length).toBe(0);
    const upd = (await as(B, () => db.query("update public.presets set name = 'hack' where id = 'p1'"))) as { affectedRows?: number };
    expect(upd.affectedRows).toBe(0);
    const del = (await as(B, () => db.query("delete from public.presets where id = 'p1'"))) as { affectedRows?: number };
    expect(del.affectedRows).toBe(0);
  });

  it("não é possível inserir preset em clínica da qual não é membro", async () => {
    await expect(as(B, () => db.query(`insert into public.presets (id, clinic_id, name) values ('p2', '${clinicA}', 'x')`))).rejects.toThrow();
  });

  it("não é possível mover um preset próprio para outra clínica", async () => {
    await expect(as(A, () => db.query(`update public.presets set clinic_id = '${clinicB}' where id = 'p1'`))).rejects.toThrow();
  });

  it("exames personalizados também são isolados", async () => {
    await as(A, () => db.query(`insert into public.custom_exams (clinic_id, id, name, aliases) values ('${clinicA}', 'custom_1', 'Vitamina C', '{"vitamina c"}')`));
    expect(((await as(B, async () => (await db.query("select * from public.custom_exams")).rows)) as unknown[]).length).toBe(0);
    await expect(as(B, () => db.query(`insert into public.custom_exams (clinic_id, id, name, aliases) values ('${clinicA}', 'c2', 'x', '{"x"}')`))).rejects.toThrow();
  });

  it("usuário não consegue se auto-adicionar em clínica alheia (memberships sem INSERT)", async () => {
    await expect(as(B, () => db.query(`insert into public.memberships (clinic_id, user_id, role) values ('${clinicA}', '${B}', 'admin')`))).rejects.toThrow();
  });

  it("visitante (anon) não acessa nada e não cria clínica", async () => {
    await expect(as(null, () => db.query("select * from public.presets"))).rejects.toThrow();
    await expect(as(null, () => db.query("select public.create_clinic('x')"))).rejects.toThrow();
  });
});
