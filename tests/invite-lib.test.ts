import { beforeEach, describe, expect, it } from "vitest";
import { hashToken, inviteLink, inviteMailto, newInviteToken } from "@/lib/invite";

describe("segredo do convite", () => {
  it("tem entropia alta, formato seguro para URL e nunca se repete", () => {
    const tokens = new Set(Array.from({ length: 200 }, newInviteToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 bytes = 192 bits
  });
  it("o hash é SHA-256 hexadecimal de 64 caracteres, estável e diferente do segredo", async () => {
    const h = await hashToken("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // vetor de teste do SHA-256
    expect(await hashToken("abc")).toBe(h);
    expect(h).not.toContain("abc");
  });
  it("o link leva o segredo e o e-mail (só para preencher o cadastro)", () => {
    expect(inviteLink("https://x.com", "TOKEN", "a+b@c.com")).toBe("https://x.com/?convite=TOKEN&email=a%2Bb%40c.com");
    expect(inviteLink("https://x.com", "TOKEN")).toBe("https://x.com/?convite=TOKEN");
  });
  it("o e-mail de convite (mailto) leva o link e avisa que é pessoal e de uso único", () => {
    const m = inviteMailto("colega@clinica.com", "Clínica A", "https://x.com/?convite=T");
    expect(m.startsWith("mailto:colega%40clinica.com?subject=")).toBe(true);
    const body = decodeURIComponent(m.split("body=")[1]);
    expect(body).toContain("https://x.com/?convite=T");
    expect(body).toContain("uma vez");
  });
});

describe("convite pendente (guardado até o cadastro terminar)", () => {
  // ambiente mínimo de navegador para testar a captura pela URL
  let store: Record<string, string>;
  let url: string;
  beforeEach(() => {
    store = {};
    url = "https://app.test/";
    const g = globalThis as unknown as Record<string, unknown>;
    g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    g.window = {
      get location() { return { href: url }; },
      history: { replaceState: (_s: unknown, _t: string, u: string) => { url = "https://app.test" + u; } },
    };
  });

  it("guarda o convite e tira o segredo da barra de endereço", async () => {
    const { capturePendingInviteFromUrl, getPendingInvite, clearPendingInvite } = await import("@/lib/invite");
    const t = "A".repeat(32);
    url = `https://app.test/?convite=${t}&email=colega%40clinica.com&outro=1`;
    expect(capturePendingInviteFromUrl()).toEqual({ token: t, email: "colega@clinica.com" });
    expect(url).toBe("https://app.test/?outro=1"); // convite e e-mail removidos da URL
    expect(getPendingInvite()?.token).toBe(t);
    clearPendingInvite();
    expect(getPendingInvite()).toBeNull();
  });
  it("ignora segredo com formato inválido (lixo na URL)", async () => {
    const { capturePendingInviteFromUrl } = await import("@/lib/invite");
    url = "https://app.test/?convite=<script>alert(1)</script>";
    expect(capturePendingInviteFromUrl()).toBeNull();
    expect(url).toBe("https://app.test/"); // mesmo inválido, sai da barra de endereço
  });
  it("convite guardado há mais de 8 dias é descartado", async () => {
    const { getPendingInvite } = await import("@/lib/invite");
    store["tolaris.pendingInvite.v1"] = JSON.stringify({ token: "B".repeat(32), at: Date.now() - 9 * 24 * 3600 * 1000 });
    expect(getPendingInvite()).toBeNull();
    expect(store["tolaris.pendingInvite.v1"]).toBeUndefined();
  });
});
