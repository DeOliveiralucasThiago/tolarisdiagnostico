"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Analyzer } from "./Analyzer";
import { AuthForm, NewPasswordForm } from "./AuthForm";
import { AuthLayout } from "./AuthLayout";
import { createClinic, fetchClinic, type Clinic } from "@/lib/cloud-store";
import { cloudStorage, localStorageAdapter } from "@/lib/storage";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";

export function AppShell() {
  // Sem Supabase configurado, o app funciona em modo local (presets só neste navegador).
  return supabaseConfigured ? <CloudApp /> : <Analyzer storage={localStorageAdapter} />;
}

function CloudApp() {
  const db = getSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [clinic, setClinic] = useState<Clinic | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);

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
    setClinic(undefined);
    if (!userId) return;
    fetchClinic(db)
      .then(setClinic)
      .catch((e: Error) => setError(e.message));
  }, [db, userId]);

  const storage = useMemo(() => (clinic ? cloudStorage(clinic) : null), [clinic]);

  if (session === undefined) return <main><p className="muted">Carregando…</p></main>;
  if (!session) return <AuthForm />;
  if (recovering) return <NewPasswordForm onDone={() => setRecovering(false)} />;
  if (error) return <main><p className="err" role="alert">Erro: {error}</p></main>;
  if (clinic === undefined) return <main><p className="muted">Carregando sua clínica…</p></main>;
  if (clinic === null) return <CreateClinic onCreated={setClinic} onSignOut={() => db.auth.signOut()} />;

  return (
    <Analyzer
      key={clinic.id}
      storage={storage!}
      account={{ email: session.user.email ?? "", clinicName: clinic.name, onSignOut: () => db.auth.signOut() }}
    />
  );
}

function CreateClinic({ onCreated, onSignOut }: { onCreated: (c: Clinic) => void; onSignOut: () => void }) {
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
