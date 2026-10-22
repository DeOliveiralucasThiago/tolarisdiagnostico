"use client";

import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { getSupabase } from "@/lib/supabase";

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/already registered|already been registered/i.test(message)) return "Este e-mail já tem cadastro. Entre com a sua senha.";
  if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/same password|different from the old/i.test(message)) return "Escolha uma senha diferente da atual.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada).";
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (/failed to fetch|network/i.test(message)) return "Sem conexão com o servidor. Tente novamente.";
  return message;
}

type Mode = "login" | "signup" | "forgot";

const COPY: Record<Mode, { title: string; hint: string; cta: string }> = {
  login: { title: "Bem-vindo de volta", hint: "Entre para acessar os seus critérios de análise.", cta: "Entrar" },
  signup: { title: "Criar sua conta", hint: "Leva menos de um minuto. Depois você cadastra a sua clínica.", cta: "Criar conta" },
  forgot: { title: "Recuperar senha", hint: "Informe o seu e-mail e enviaremos um link para criar uma nova senha.", cta: "Enviar link" },
};

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
  };

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
      } else if (mode === "signup") {
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setInfo("Enviamos um e-mail de confirmação. Clique no link e depois entre aqui.");
      } else {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        // mensagem neutra: não revela se o e-mail tem cadastro
        setInfo("Se este e-mail tiver cadastro, enviamos um link para criar uma nova senha. Verifique também o spam.");
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const c = COPY[mode];

  return (
    <AuthLayout>
      {mode !== "forgot" && (
        <div className="tabs" role="tablist" aria-label="Acesso">
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => go("login")} type="button">Entrar</button>
          <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => go("signup")} type="button">Criar conta</button>
        </div>
      )}
      <h2 className="auth-title">{c.title}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{c.hint}</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>E-mail</span>
          <input type="email" required autoComplete="email" placeholder="voce@clinica.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "forgot" && (
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Mínimo de 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {mode === "login" && (
          <button type="button" className="link" onClick={() => go("forgot")}>Esqueci minha senha</button>
        )}
        <button className="primary big" disabled={busy}>{busy ? "Aguarde…" : c.cta}</button>
        {error && <p className="err" role="alert">{error}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        {mode === "forgot" && (
          <button type="button" className="link" onClick={() => go("login")}>← Voltar para entrar</button>
        )}
      </form>
    </AuthLayout>
  );
}

/** Mostrada ao abrir o link de "esqueci minha senha" enviado por e-mail. */
export function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      onDone();
    } catch (err) {
      setError(friendly((err as Error).message));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="auth-title">Criar nova senha</h2>
      <p className="muted" style={{ marginBottom: 18 }}>Escolha uma nova senha para a sua conta.</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Nova senha</span>
          <input type="password" required minLength={6} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Repita a nova senha</span>
          <input type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className="primary big" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
        {error && <p className="err" role="alert">{error}</p>}
      </form>
    </AuthLayout>
  );
}
