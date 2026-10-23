"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHead } from "./SectionHead";
import type { InviteRow, Member, Role, TeamApi } from "@/lib/cloud-store";
import { copyText } from "@/lib/clipboard";
import { inviteLink, inviteMailto } from "@/lib/invite";

interface Props {
  api: TeamApi;
  myUserId: string;
  clinicName: string;
  onClose: () => void;
}

const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", doctor: "Médico" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function friendly(message: string): string {
  if (/invites|clinic_members|set_member_role|remove_member|schema cache|does not exist|Could not find/i.test(message)) {
    return "Falta aplicar a migração 0002_invites.sql no banco (Supabase). Veja o README, seção “Convite de médicos”.";
  }
  if (/duplicate key|already exists/i.test(message)) return "Já existe um convite com este código. Tente novamente.";
  if (/new row violates|permission denied|sem permissão/i.test(message)) return "Sem permissão: só administradores da clínica podem fazer isso.";
  return message;
}

export function TeamPanel({ api, myUserId, clinicName, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("doctor");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; link: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([api.listMembers(), api.listInvites()]);
      setMembers(m);
      setInvites(i);
      setError("");
    } catch (e) {
      setError(friendly((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      setError("Informe um e-mail válido.");
      return;
    }
    return run(async () => {
      const { token, expiresAt } = await api.createInvite(target, role);
      setCreated({ email: target, link: inviteLink(window.location.origin, token, target), expiresAt });
      setCopied(false);
      setEmail("");
    });
  };

  const pendingList = invites.filter((i) => !i.acceptedAt);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Equipe da clínica" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Equipe · {clinicName}</h2>
          <button className="small" onClick={onClose} autoFocus>Fechar</button>
        </div>

        {error && <p className="err" role="alert">{error}</p>}

        <section className="modal-section">
          <SectionHead n={1} title="Convidar um médico" hint="Gere um link pessoal e envie ao colega. Ele cria a conta (ou entra) com o e-mail convidado e passa a usar os mesmos critérios da clínica." />
          <form className="row" onSubmit={invite}>
            <input type="email" required placeholder="E-mail do colega" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail do convidado" style={{ minWidth: 260 }} />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Papel do convidado">
              <option value="doctor">Médico</option>
              <option value="admin">Administrador</option>
            </select>
            <button className="primary" disabled={busy}>Gerar convite</button>
          </form>
          <p className="muted" style={{ marginTop: 8 }}>
            <strong>Médico</strong> usa e edita os critérios. <strong>Administrador</strong> também convida e remove pessoas da equipe.
          </p>

          {created && (
            <div className="sub-card" role="status">
              <strong>Convite criado para {created.email}.</strong>
              <p className="muted" style={{ margin: "4px 0 8px" }}>
                O link é pessoal, vale até {fmt(created.expiresAt)}, só pode ser usado uma vez e só funciona com esse e-mail.
                <strong> Guarde-o agora: por segurança, ele não poderá ser exibido de novo.</strong>
              </p>
              <input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" style={{ width: "100%" }} />
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="small primary"
                  onClick={async () => {
                    if (await copyText(created.link)) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2500);
                    }
                  }}
                >
                  {copied ? "✓ Link copiado" : "Copiar link"}
                </button>
                <a className="btn-link small" href={inviteMailto(created.email, clinicName, created.link)}>Enviar por e-mail</a>
              </div>
            </div>
          )}
        </section>

        <section className="modal-section">
          <SectionHead n={2} title="Pessoas da clínica" />
          {loading ? (
            <p className="muted">Carregando…</p>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 480 }}>
                <thead>
                  <tr><th>E-mail</th><th>Papel</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}>
                      <td>{m.email} {m.userId === myUserId && <span className="badge">você</span>}</td>
                      <td>
                        <select value={m.role} disabled={busy} onChange={(e) => run(() => api.setRole(m.userId, e.target.value as Role))} aria-label={`Papel de ${m.email}`}>
                          <option value="doctor">{ROLE_LABEL.doctor}</option>
                          <option value="admin">{ROLE_LABEL.admin}</option>
                        </select>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {m.userId !== myUserId && (
                          <button
                            className="small ghost"
                            disabled={busy}
                            onClick={() => window.confirm(`Remover ${m.email} da clínica? A pessoa perde o acesso aos critérios (a conta dela continua existindo).`) && run(() => api.removeMember(m.userId))}
                            aria-label={`Remover ${m.email}`}
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="modal-section">
          <SectionHead n={3} title="Convites pendentes" hint="Para reenviar, revogue e crie outro: o link antigo não pode ser exibido de novo." />
          {pendingList.length === 0 ? (
            <p className="muted">Nenhum convite pendente.</p>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 480 }}>
                <thead>
                  <tr><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr>
                </thead>
                <tbody>
                  {pendingList.map((i) => {
                    const expired = new Date(i.expiresAt) < new Date();
                    return (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td>{ROLE_LABEL[i.role]}</td>
                        <td className="muted">{expired ? `Expirado em ${fmt(i.expiresAt)}` : `Vale até ${fmt(i.expiresAt)}`}</td>
                        <td style={{ textAlign: "right" }}>
                          <button className="small ghost" disabled={busy} onClick={() => run(() => api.revokeInvite(i.id))} aria-label={`Revogar convite de ${i.email}`}>Revogar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
