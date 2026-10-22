"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Analyzer } from "./Analyzer";
import { AuthForm } from "./AuthForm";
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

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
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
    <main style={{ maxWidth: 420 }}>
      <h1>Quase lá</h1>
      <p className="sub">Cadastre o nome da sua clínica. Os presets de critérios ficam vinculados a ela.</p>
      <form className="card" onSubmit={submit}>
        <div style={{ display: "grid", gap: 10 }}>
          <input type="text" required placeholder="Nome da clínica" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da clínica" />
          <button className="primary" disabled={busy || !name.trim()}>{busy ? "Criando…" : "Criar clínica"}</button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </form>
      <button onClick={onSignOut}>Sair</button>
    </main>
  );
}
