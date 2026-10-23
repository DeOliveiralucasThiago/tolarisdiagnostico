"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Analyzer } from "./Analyzer";
import { AuthForm, NewPasswordForm } from "./AuthForm";
import { AuthLayout } from "./AuthLayout";
import { acceptInvite, createClinic, fetchMemberships, teamApi, type Clinic, type Membership } from "@/lib/cloud-store";
import { capturePendingInviteFromUrl, clearPendingInvite, getPendingInvite, type PendingInvite } from "@/lib/invite";
import { cloudStorage, localStorageAdapter } from "@/lib/storage";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";

export function AppShell() {
  // Sem Supabase configurado, o app funciona em modo local (presets só neste navegador).
  return supabaseConfigured ? <CloudApp /> : <Analyzer storage={localStorageAdapter} />;
}

const LAST_CLINIC_KEY = "tolaris.lastClinic.v1";
const lastClinic = (userId: string): string | null => {
  try {
    return localStorage.getItem(`${LAST_CLINIC_KEY}:${userId}`);
  } catch {
    return null;
  }
};
const rememberClinic = (userId: string, clinicId: string) => {
  try {
    localStorage.setItem(`${LAST_CLINIC_KEY}:${userId}`, clinicId);
  } catch {
    /* ignora */
  }
};

function CloudApp() {
  const db = getSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberships, setMemberships] = useState<Membership[] | undefined>(undefined);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [pending, setPending] = useState<PendingInvite | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // convite vindo da URL (?convite=...): guarda e tira da barra de endereço
  useEffect(() => {
    setPending(capturePendingInviteFromUrl());
  }, []);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((event, s) => {
      // link de "esqueci minha senha": pede a nova senha antes de entrar no app
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [db]);

  const userId = session?.user.id;
  useEffect(() => {
    setMemberships(undefined);
    setClinicId(null);
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // 1) se há convite pendente, aceita ANTES de oferecer "criar clínica"
      let joined: string | null = null;
      const invite = getPendingInvite();
      if (invite) {
        try {
          joined = await acceptInvite(db, invite.token);
        } catch (e) {
          if (!cancelled) setNotice({ kind: "err", text: `Não foi possível aceitar o convite: ${(e as Error).message}` });
        }
        clearPendingInvite();
        if (!cancelled) setPending(null);
      }
      // 2) clínicas do usuário (a do convite tem prioridade; senão a última usada)
      const list = await fetchMemberships(db);
      if (cancelled) return;
      setMemberships(list);
      const chosen = list.find((m) => m.clinic.id === joined) ?? list.find((m) => m.clinic.id === lastClinic(userId)) ?? list[0];
      if (joined && chosen) setNotice({ kind: "ok", text: `Convite aceito: você agora faz parte da clínica ${chosen.clinic.name}.` });
      setClinicId(chosen?.clinic.id ?? null);
    })().catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const current = memberships?.find((m) => m.clinic.id === clinicId);
  const storage = useMemo(() => (current ? cloudStorage(current.clinic) : null), [current]);
  const team = useMemo(() => (current ? teamApi(db, current.clinic.id) : null), [db, current]);

  if (session === undefined) return <main><p className="muted">Carregando…</p></main>;
  if (!session) return <AuthForm invite={pending} />;
  if (recovering) return <NewPasswordForm onDone={() => setRecovering(false)} />;
  if (error) return <main><p className="err" role="alert">Erro: {error}</p></main>;
  if (memberships === undefined) return <main><p className="muted">Carregando sua clínica…</p></main>;
  if (!current) {
    return (
      <CreateClinic
        onCreated={(clinic) => {
          setMemberships([{ clinic, role: "admin" }]);
          setClinicId(clinic.id);
          if (userId) rememberClinic(userId, clinic.id);
        }}
        onSignOut={() => db.auth.signOut()}
        notice={notice}
      />
    );
  }

  return (
    <>
      {notice && (
        <div className={`notice-bar ${notice.kind}`} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
          <button className="small ghost" onClick={() => setNotice(null)} aria-label="Fechar aviso">✕</button>
        </div>
      )}
      <Analyzer
        key={current.clinic.id}
        storage={storage!}
        account={{
          email: session.user.email ?? "",
          userId: session.user.id,
          clinicName: current.clinic.name,
          role: current.role,
          clinics: memberships.map((m) => m.clinic),
          clinicId: current.clinic.id,
          onSwitchClinic: (id) => {
            setClinicId(id);
            rememberClinic(session.user.id, id);
          },
          team: team!,
          onSignOut: () => db.auth.signOut(),
        }}
      />
    </>
  );
}

function CreateClinic({ onCreated, onSignOut, notice }: { onCreated: (c: Clinic) => void; onSignOut: () => void; notice?: { kind: "ok" | "err"; text: string } | null }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await createClinic(getSupabase(), name));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      {notice && <p className={notice.kind === "ok" ? "notice" : "err"} role="alert" style={{ marginBottom: 12 }}>{notice.text}</p>}
      <h2 className="auth-title">Quase lá</h2>
      <p className="muted" style={{ marginBottom: 18 }}>Cadastre o nome da sua clínica. Os critérios de análise ficam vinculados a ela.</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Nome da clínica</span>
          <input type="text" required placeholder="Ex.: Clínica Saúde Ocupacional" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary big" disabled={busy || !name.trim()}>{busy ? "Criando…" : "Criar clínica"}</button>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="button" className="link" onClick={onSignOut}>Sair</button>
      </form>
    </AuthLayout>
  );
}
