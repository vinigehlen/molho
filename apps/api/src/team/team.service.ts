import { parseEmail, TEAM_SUBORDINATE_ROLES, type InviteTeamMemberInput, type TeamMember, type TeamRole } from '@molho/contracts';
import type { TeamRepository } from './team.repository';
import {
  AlreadyMemberError,
  CannotManageOwnRoleError,
  LastOwnerError,
  RoleNotManageableError,
  TeamMemberNotFoundError,
} from './team.errors';

/** subordinatesOnly vem do `can()` do chamador (packages/contracts/permissions.ts) — service não conhece RBAC, só aplica a restrição. */
export interface TeamActor {
  id: string;
  role: string;
  subordinatesOnly: boolean;
}

function assertManageable(actor: TeamActor, role: TeamRole): void {
  if (actor.subordinatesOnly && !TEAM_SUBORDINATE_ROLES.includes(role as (typeof TEAM_SUBORDINATE_ROLES)[number])) {
    throw new RoleNotManageableError(role);
  }
}

/**
 * V1 do painel de equipe (escopo tenant, sem multi-loja — ver team.ts).
 * `manager` (subordinatesOnly) nunca convida/edita/revoga owner nem outro
 * manager; ninguém mexe no próprio acesso por aqui (evita se autoexcluir);
 * revogar/trocar o último owner é bloqueado (tenant não pode ficar órfão).
 */
export class TeamService {
  constructor(private readonly repo: TeamRepository) {}

  list(tenantId: string): Promise<TeamMember[]> {
    return this.repo.list(tenantId).then((rows) =>
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    );
  }

  async invite(input: InviteTeamMemberInput, tenantId: string, actor: TeamActor): Promise<TeamMember> {
    assertManageable(actor, input.role);

    const email = parseEmail(input.email);
    const { id: userId, created: userCreated } = await this.repo.findOrCreateUser(email, input.name);

    const existingRole = await this.repo.findRole(tenantId, userId);
    if (existingRole && existingRole !== input.role) throw new AlreadyMemberError();
    if (!existingRole) await this.repo.createRoleAssignment(userId, input.role, tenantId);

    await this.repo.recordAuditLog({
      tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'team.invite',
      userId,
      afterJson: { role: input.role, userCreated },
    });

    return { userId, name: input.name, role: input.role, createdAt: new Date().toISOString() };
  }

  async updateRole(userId: string, newRole: TeamRole, tenantId: string, actor: TeamActor): Promise<void> {
    if (actor.id === userId) throw new CannotManageOwnRoleError();

    const currentRole = await this.repo.findRole(tenantId, userId);
    if (!currentRole) throw new TeamMemberNotFoundError(userId);

    assertManageable(actor, currentRole);
    assertManageable(actor, newRole);

    if (currentRole === 'owner' && newRole !== 'owner' && (await this.repo.countOwners(tenantId)) <= 1) {
      throw new LastOwnerError();
    }

    await this.repo.replaceRoleAssignment(userId, tenantId, newRole);
    await this.repo.recordAuditLog({
      tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'team.role_update',
      userId,
      beforeJson: { role: currentRole },
      afterJson: { role: newRole },
    });
  }

  async revoke(userId: string, tenantId: string, actor: TeamActor): Promise<void> {
    if (actor.id === userId) throw new CannotManageOwnRoleError();

    const currentRole = await this.repo.findRole(tenantId, userId);
    if (!currentRole) throw new TeamMemberNotFoundError(userId);

    assertManageable(actor, currentRole);

    if (currentRole === 'owner' && (await this.repo.countOwners(tenantId)) <= 1) {
      throw new LastOwnerError();
    }

    await this.repo.revokeAccess(userId, tenantId);
    await this.repo.recordAuditLog({
      tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'team.revoke',
      userId,
      beforeJson: { role: currentRole },
    });
  }
}
