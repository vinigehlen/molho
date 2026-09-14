'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchTeam,
  inviteTeamMember,
  revokeTeamMember,
  TEAM_ROLES,
  TEAM_ROLE_LABELS,
  TeamUnavailableError,
  updateTeamMemberRole,
  type TeamMember,
  type TeamRole,
} from '../../../lib/team-api';

/**
 * Painel de equipe V1 (escopo tenant — ver docs, multi-loja fica pro módulo
 * multi_store). Convidar cria/reusa o User pelo e-mail e concede o papel;
 * login continua sendo por OTP (Épico 9b), sem senha por aqui.
 */
export function TeamCard() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable' | 'error'; members: TeamMember[] }>({
    status: 'loading',
    members: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('cashier');

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', members: await fetchTeam() });
    } catch (err) {
      setState({ status: err instanceof TeamUnavailableError ? 'unavailable' : 'error', members: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu certo agora.');
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'unavailable') return null;

  return (
    <section className="rounded-[14px] border border-border bg-bg p-4">
      <h3 className="text-base font-semibold text-text">Equipe</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Quem trabalha na loja entra por código enviado no e-mail (sem senha). Convide pelo nome e e-mail e escolha o
        papel — dá pra trocar ou revogar a qualquer momento.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !email.trim()) return;
          void run(async () => {
            await inviteTeamMember({ name: name.trim(), email: email.trim(), role });
            setName('');
            setEmail('');
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Nome
          <input
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            placeholder="Ex.: Ana"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          E-mail
          <input
            type="email"
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            placeholder="ana@email.com"
            value={email}
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Papel
          <select
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            value={role}
            onChange={(event) => setRole(event.target.value as TeamRole)}
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {TEAM_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || !email.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50"
        >
          Convidar
        </button>
      </form>

      {error && (
        <p className="mt-2 text-xs font-medium text-critical" aria-live="polite">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {state.status === 'loading' && <li className="py-3 text-sm text-text-muted">Carregando…</li>}
        {state.status === 'error' && <li className="py-3 text-sm text-critical">Não deu pra carregar a equipe.</li>}
        {state.status === 'ready' && state.members.length === 0 && (
          <li className="py-3 text-sm text-text-muted">Ninguém convidado ainda.</li>
        )}
        {state.members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-medium text-text">{member.name}</p>
              <p className="text-xs text-text-muted">
                {TEAM_ROLE_LABELS[member.role]} · desde {new Date(member.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={`Trocar papel de ${member.name}`}
                disabled={busy}
                className="rounded-[10px] border border-border bg-bg-card px-2 py-1 text-xs text-text disabled:opacity-50"
                value={member.role}
                onChange={(event) => void run(() => updateTeamMemberRole(member.userId, event.target.value as TeamRole))}
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {TEAM_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                className="rounded-full border border-critical px-3 py-1 text-xs font-medium text-critical disabled:opacity-50"
                onClick={() => void run(() => revokeTeamMember(member.userId))}
              >
                Revogar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
