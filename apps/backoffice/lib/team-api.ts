import { apiFetch } from './api-client';

export const TEAM_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'courier', 'accountant', 'marketing'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Dono',
  manager: 'Gerente',
  cashier: 'Caixa',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  courier: 'Entregador',
  accountant: 'Contador',
  marketing: 'Marketing',
};

export interface TeamMember {
  userId: string;
  name: string;
  role: TeamRole;
  createdAt: string;
}

/** Sem permissão `team.manage` neste tenant — a seção nem aparece (mesmo padrão de PrintingUnavailableError). */
export class TeamUnavailableError extends Error {
  constructor() {
    super('Você não tem acesso à gestão de equipe.');
  }
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await apiFetch('/v1/team');
  if (res.status === 403) throw new TeamUnavailableError();
  if (!res.ok) throw new Error(`Falha ao carregar equipe (${res.status})`);
  return (await res.json()) as TeamMember[];
}

export async function inviteTeamMember(input: { name: string; email: string; role: TeamRole }): Promise<TeamMember> {
  const res = await apiFetch('/v1/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 403) throw new Error('Sem permissão para convidar esse papel.');
  if (!res.ok) throw new Error(`Falha ao convidar (${res.status})`);
  return (await res.json()) as TeamMember;
}

export async function updateTeamMemberRole(userId: string, role: TeamRole): Promise<void> {
  const res = await apiFetch(`/v1/team/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (res.status === 404) throw new Error('Staff não encontrado.');
  if (res.status === 403) throw new Error('Sem permissão para essa troca de papel.');
  if (!res.ok && res.status !== 204) throw new Error(`Falha ao trocar papel (${res.status})`);
}

export async function revokeTeamMember(userId: string): Promise<void> {
  const res = await apiFetch(`/v1/team/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (res.status === 404) throw new Error('Staff não encontrado.');
  if (res.status === 403) throw new Error('Sem permissão para revogar esse acesso.');
  if (!res.ok && res.status !== 204) throw new Error(`Falha ao revogar (${res.status})`);
}
