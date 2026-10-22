"use client";

import { useState } from "react";
import { Logo } from "@/components/Icons";
import { getSupabase } from "@/lib/supabase";

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/already registered|already been registered/i.test(message)) return "Este e-mail já tem cadastro. Entre com a sua senha.";
  if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada).";
  if (/failed to fetch|network/i.test(message)) return "Sem conexão com o servidor. Tente novamente.";
  return message;
}

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const auth = getSupabase().auth;
      if (mode === "login") {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setInfo("Enviamos um e-mail de confirmação. Clique no link e depois entre aqui.");
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={48} />
          <div>
            <h1>Tolaris Diagnóstico</h1>
            <p className="sub">Triagem rápida de exames de sangue para a medicina do trabalho</p>
          </div>
        </div>
        <form className="card" onSubmit={submit}>
          <h2 style={{ marginBottom: 14 }}>{mode === "login" ? "Entrar na sua conta" : "Criar conta"}</h2>
          <input type="email" required autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Senha"
          />
          <button className="primary" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
          {error && <p className="err" role="alert">{error}</p>}
          {info && <p role="status">{info}</p>}
          <p className="muted" style={{ textAlign: "center" }}>
            {mode === "login" ? "Ainda não tem conta? " : "Já tem conta? "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setInfo("");
              }}
            >
              {mode === "login" ? "Criar conta" : "Entrar"}
            </a>
          </p>
        </form>
        <p className="muted" style={{ textAlign: "center" }}>Os laudos dos pacientes nunca são enviados nem armazenados.</p>
      </div>
    </main>
  );
}
