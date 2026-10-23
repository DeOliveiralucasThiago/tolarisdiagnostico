import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/** Roda as migrações 0001 e 0002 em um Postgres de verdade (PGlite) e testa convites e equipe com RLS. */
const U = { admin: "aaaaaaaa-0000-0000-0000-000000000001", doc: "aaaaaaaa-0000-0000-0000-000000000002", novo: "aaaaaaaa-0000-0000-0000-000000000003", fora: "aaaaaaaa-0000-0000-0000-000000000004", admin2: "aaaaaaaa-0000-0000-0000-000000000005" };
const EMAIL: Record<string, string> = { [U.admin]: "dra@clinica.com", [U.doc]: "colega@clinica.com", [U.novo]: "novo@clinica.com", [U.fora]: "intruso@outra.com", [U.admin2]: "admin2@clinica.com" };

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ""}', false)`);
  await db.exec(`select set_config('request.jwt.claims', '${user ? JSON.stringify({ sub: user, email: EMAIL[user] }) : "{}"}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const sha = async (t: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))).toString("hex");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email varchar(255));
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
  `);
  for (const [id, email] of Object.entries(EMAIL)) await db.query("insert into auth.users values ($1, $2)", [id, email]);
  for (const f of ["0001_init.sql", "0002_invites.sql"]) await db.exec(readFileSync(path.resolve(__dirname, "../supabase/migrations", f), "utf8"));
});

describe("convites e equipe (RLS no Postgres real)", () => {
  let clinic = "";
  let outra = "";
  const token = "segredo-do-convite-" + "x".repeat(30);
  const invite = async (email: string, t: string, extra = "") =>
    q(`insert into public.invites (clinic_id, email, token_hash${extra ? ", expires_at" : ""}) values ($1, $2, $3${extra ? `, ${extra}` : ""})`, [clinic, email, await sha(t)]);

  it("o admin cria a clínica e o hash calculado no navegador é o mesmo que o banco calcula", async () => {
    clinic = await as(U.admin, async () => (await q<{ id: string }>("select public.create_clinic('Clínica A') as id"))[0].id);
    outra = await as(U.fora, async () => (await q<{ id: string }>("select public.create_clinic('Outra') as id"))[0].id);
    const dbHash = (await q<{ h: string }>("select encode(sha256(convert_to($1,'UTF8')),'hex') as h", [token]))[0].h;
    expect(await sha(token)).toBe(dbHash);
  });

  it("o banco só aceita o hash do segredo (64 caracteres hexadecimais), nunca texto qualquer", async () => {
    for (const ruim of ["x", "tokenCurto", "G".repeat(64)]) {
      await expect(as(U.admin, () => q("insert into public.invites (clinic_id, email, token_hash) values ($1,'novo@clinica.com',$2)", [clinic, ruim]))).rejects.toThrow();
    }
    await expect(as(U.admin, () => q("insert into public.invites (clinic_id, email, token_hash) values ($1,'sem-arroba',$2)", [clinic, "a".repeat(64)]))).rejects.toThrow();
  });

  it("só administrador da clínica cria convite", async () => {
    await as(U.admin, () => invite("novo@clinica.com", token));
    expect(((await as(U.admin, () => q("select token_hash from public.invites")))[0] as { token_hash: string }).token_hash).toBe(await sha(token));
    // admin de OUTRA clínica não cria convite para esta
    await expect(as(U.fora, () => invite("x@y.com", "outro-segredo"))).rejects.toThrow();
  });

  it("convite com validade acima de 31 dias é recusado", async () => {
    await expect(as(U.admin, () => invite("a@b.com", "longo", "now() + interval '90 days'"))).rejects.toThrow();
  });

  it("quem não é admin (ou é de outra clínica) não enxerga os convites nem a equipe", async () => {
    expect(await as(U.fora, () => q("select * from public.invites"))).toHaveLength(0);
    expect(await as(U.fora, () => q("select * from public.clinic_members($1)", [clinic]))).toHaveLength(0);
    expect(await as(U.admin, () => q("select * from public.clinic_members($1)", [clinic]))).toEqual([expect.objectContaining({ email: "dra@clinica.com", role: "admin" })]);
  });

  it("visitante (anon) não acessa nada", async () => {
    await expect(as(null, () => q("select * from public.invites"))).rejects.toThrow();
    await expect(as(null, () => q("select public.accept_invite('x')"))).rejects.toThrow();
    await expect(as(null, () => q("select * from public.clinic_members($1)", [clinic]))).rejects.toThrow();
  });

  it("segredo errado, vazio ou e-mail de outra pessoa: convite recusado", async () => {
    await expect(as(U.novo, () => q("select public.accept_invite('segredo-errado')"))).rejects.toThrow(/inválido/);
    await expect(as(U.novo, () => q("select public.accept_invite('')"))).rejects.toThrow(/inválido/);
    // segredo certo, mas a conta tem OUTRO e-mail: não entra na clínica
    await expect(as(U.doc, () => q("select public.accept_invite($1)", [token]))).rejects.toThrow(/inválido/);
    expect(await q("select * from public.memberships where user_id = $1", [U.doc])).toHaveLength(0);
  });

  it("o convidado aceita com o e-mail certo e passa a ver os dados da clínica, e só dela", async () => {
    await as(U.admin, () => q("insert into public.presets (id, clinic_id, name) values ('p1', $1, 'Meu')", [clinic]));
    expect(await as(U.novo, () => q("select * from public.presets"))).toHaveLength(0); // ainda não é membro
    const r = await as(U.novo, () => q<{ accept_invite: string }>("select public.accept_invite($1)", [token]));
    expect(r[0].accept_invite).toBe(clinic);
    expect(await as(U.novo, () => q("select id from public.presets"))).toEqual([{ id: "p1" }]);
    expect(await q("select role from public.memberships where user_id = $1", [U.novo])).toEqual([{ role: "doctor" }]);
    expect(await as(U.novo, () => q("select id from public.clinics"))).toEqual([{ id: clinic }]); // não vê a outra clínica
  });

  it("uso único: o mesmo convite não funciona de novo", async () => {
    await expect(as(U.novo, () => q("select public.accept_invite($1)", [token]))).rejects.toThrow(/inválido/);
  });

  it("convite expirado não funciona", async () => {
    const t = "convite-expirado-" + "y".repeat(30);
    await db.query("insert into public.invites (clinic_id, email, token_hash, expires_at) values ($1,'colega@clinica.com',$2, now() - interval '1 minute')", [clinic, await sha(t)]);
    await expect(as(U.doc, () => q("select public.accept_invite($1)", [t]))).rejects.toThrow(/inválido/);
  });

  it("a comparação do e-mail ignora maiúsculas", async () => {
    const t = "convite-maiusculas-" + "z".repeat(30);
    await as(U.admin, () => invite("COLEGA@Clinica.com", t));
    await as(U.doc, () => q("select public.accept_invite($1)", [t]));
    expect(await q("select role from public.memberships where user_id = $1", [U.doc])).toEqual([{ role: "doctor" }]);
  });

  it("médico (não admin) não convida, não vê a equipe, não muda papéis nem remove ninguém", async () => {
    await expect(as(U.doc, () => invite("a@b.com", "d1"))).rejects.toThrow();
    expect(await as(U.doc, () => q("select * from public.clinic_members($1)", [clinic]))).toHaveLength(0);
    await expect(as(U.doc, () => q("select public.set_member_role($1,$2,'admin')", [clinic, U.doc]))).rejects.toThrow(/permissão/);
    await expect(as(U.doc, () => q("select public.remove_member($1,$2)", [clinic, U.admin]))).rejects.toThrow(/permissão/);
  });

  it("o admin lista a equipe, promove e rebaixa, e a clínica nunca fica sem administrador", async () => {
    const equipe = await as(U.admin, () => q<{ email: string }>("select email from public.clinic_members($1)", [clinic]));
    expect(equipe.map((m) => m.email).sort()).toEqual(["colega@clinica.com", "dra@clinica.com", "novo@clinica.com"]);
    await expect(as(U.admin, () => q("select public.set_member_role($1,$2,'doctor')", [clinic, U.admin]))).rejects.toThrow(/pelo menos um administrador/);
    await expect(as(U.admin, () => q("select public.remove_member($1,$2)", [clinic, U.admin]))).rejects.toThrow(/pelo menos um administrador/);
    await as(U.admin, () => q("select public.set_member_role($1,$2,'admin')", [clinic, U.doc])); // promove o colega
    await as(U.admin, () => q("select public.set_member_role($1,$2,'doctor')", [clinic, U.admin])); // agora dá para rebaixar o primeiro
    expect(await q("select role from public.memberships where user_id = $1", [U.admin])).toEqual([{ role: "doctor" }]);
    await expect(as(U.admin, () => q("select public.set_member_role($1,$2,'admin')", [clinic, U.admin]))).rejects.toThrow(/permissão/); // ex-admin perdeu o poder
    await as(U.doc, () => q("select public.set_member_role($1,$2,'admin')", [clinic, U.admin])); // o novo admin restaura
  });

  it("remover membro tira o acesso aos dados da clínica", async () => {
    await as(U.admin, () => q("select public.remove_member($1,$2)", [clinic, U.novo]));
    expect(await as(U.novo, () => q("select * from public.presets"))).toHaveLength(0);
    await expect(as(U.admin, () => q("select public.remove_member($1,$2)", [clinic, U.novo]))).rejects.toThrow(/não encontrado/);
  });

  it("admin de outra clínica não altera nem remove membros desta", async () => {
    await expect(as(U.fora, () => q("select public.remove_member($1,$2)", [clinic, U.doc]))).rejects.toThrow(/permissão/);
    await expect(as(U.fora, () => q("select public.set_member_role($1,$2,'doctor')", [clinic, U.admin]))).rejects.toThrow(/permissão/);
    expect(outra).not.toBe(clinic);
  });

  it("revogar convite: só admin da clínica e só convites pendentes", async () => {
    const t = "convite-revogado-" + "w".repeat(30);
    await as(U.admin, () => invite("novo@clinica.com", t));
    const [{ id }] = await q<{ id: string }>("select id from public.invites where accepted_at is null order by created_at desc limit 1");
    await as(U.fora, () => q("delete from public.invites where id = $1", [id])); // outra clínica: não apaga nada
    expect(await q("select id from public.invites where id = $1", [id])).toHaveLength(1);
    await as(U.admin, () => q("delete from public.invites where id = $1", [id]));
    expect(await q("select id from public.invites where id = $1", [id])).toHaveLength(0);
    await expect(as(U.novo, () => q("select public.accept_invite($1)", [t]))).rejects.toThrow(/inválido/);
  });

  it("convite já aceito não pode ser apagado pelo admin (fica o registro)", async () => {
    const [{ id }] = await q<{ id: string }>("select id from public.invites where accepted_at is not null limit 1");
    await as(U.doc, () => q("delete from public.invites where id = $1", [id])); // doc agora é admin da clínica
    expect(await q("select id from public.invites where id = $1", [id])).toHaveLength(1);
  });
});
