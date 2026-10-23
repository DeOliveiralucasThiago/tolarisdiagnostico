/**
 * Convites de médicos. O segredo do convite é gerado AQUI, no navegador de quem convida, e só o hash SHA-256
 * dele vai para o banco: nem o servidor consegue recuperar o link depois.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const KEY = "tolaris.pendingInvite.v1";
const MAX_AGE_MS = 8 * 24 * 3600 * 1000;

export function newInviteToken(): string {
  const bytes = new Uint8Array(24); // 192 bits
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteLink(origin: string, token: string, email?: string): string {
  return `${origin}/?convite=${token}${email ? `&email=${encodeURIComponent(email)}` : ""}`;
}

export function inviteMailto(email: string, clinicName: string, link: string): string {
  const subject = `Convite para a clínica ${clinicName} no Tolaris Diagnóstico`;
  const body = `Olá!\n\nVocê foi convidado(a) para a equipe da clínica ${clinicName} no Tolaris Diagnóstico.\n\nPara entrar, abra o link abaixo e crie sua conta (ou entre) usando este mesmo e-mail (${email}):\n${link}\n\nO link é pessoal, vale por 7 dias e só pode ser usado uma vez.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface PendingInvite {
  token: string;
  email?: string;
}

/**
 * Se a URL traz ?convite=..., guarda o convite (para sobreviver a cadastro e confirmação de e-mail) e remove os
 * parâmetros da barra de endereço, para o segredo não ficar visível nem vazar em capturas de tela.
 */
export function capturePendingInviteFromUrl(): PendingInvite | null {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("convite");
    if (token && TOKEN_RE.test(token)) {
      const email = url.searchParams.get("email") ?? undefined;
      localStorage.setItem(KEY, JSON.stringify({ token, email, at: Date.now() }));
    }
    if (url.searchParams.has("convite") || url.searchParams.has("email")) {
      url.searchParams.delete("convite");
      url.searchParams.delete("email");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    }
  } catch {
    /* sem URL ou armazenamento: segue sem convite */
  }
  return getPendingInvite();
}

export function getPendingInvite(): PendingInvite | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { token?: string; email?: string; at?: number };
    if (!v.token || !TOKEN_RE.test(v.token) || !v.at || Date.now() - v.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { token: v.token, email: typeof v.email === "string" ? v.email : undefined };
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
