import type { EmailAddress, TeamRole } from '@molho/contracts';
import { encryptEmail, hashEmailForLookup, Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface ProvisionedIdentity {
  id: string;
  created: boolean;
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  role: TeamRole;
  createdAt: Date;
}

/**
 * Sem RLS em `users`/`user_roles` de propósito (CLAUDE.md) — toda query aqui
 * filtra tenant explicitamente no WHERE, nunca lê a tabela inteira. Reusa a
 * mesma chave de identidade do staff-auth/staff-provisioning: e-mail → hash
 * → User global, sem tenant_id.
 */
export class TeamRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(tenantId: string): Promise<TeamMemberRow[]> {
    const client = this.requestContext.getClient();
    const rows = await client.userRole.findMany({
      where: { scopeType: 'tenant', scopeId: tenantId, user: { deletedAt: null } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      role: r.role as TeamRole,
      createdAt: r.createdAt,
    }));
  }

  /** findFirst+create, NUNCA upsert — mesmo racional de staff-provisioning.repository.ts (índice único parcial). */
  async findOrCreateUser(email: EmailAddress, name: string): Promise<ProvisionedIdentity> {
    const client = this.requestContext.getClient();
    const emailHash = hashEmailForLookup(email);
    const existing = await client.user.findFirst({
      where: { emailLookupHash: emailHash, deletedAt: null },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const { ciphertext, keyVersion } = encryptEmail(email);
    const user = await client.user.create({
      data: {
        name,
        emailCiphertext: new Uint8Array(ciphertext),
        emailLookupHash: emailHash,
        emailKeyVersion: keyVersion,
      },
      select: { id: true },
    });
    return { id: user.id, created: true };
  }

  async findRole(tenantId: string, userId: string): Promise<TeamRole | null> {
    const client = this.requestContext.getClient();
    const row = await client.userRole.findFirst({
      where: { userId, scopeType: 'tenant', scopeId: tenantId },
      select: { role: true },
    });
    return (row?.role as TeamRole | undefined) ?? null;
  }

  async countOwners(tenantId: string): Promise<number> {
    const client = this.requestContext.getClient();
    return client.userRole.count({ where: { role: 'owner', scopeType: 'tenant', scopeId: tenantId } });
  }

  async createRoleAssignment(userId: string, role: TeamRole, tenantId: string): Promise<void> {
    const client = this.requestContext.getClient();
    await client.userRole.create({ data: { userId, role, scopeType: 'tenant', scopeId: tenantId } });
  }

  /** V1: um papel por staff por tenant — trocar é apagar o antigo e criar o novo (não upsert: histórico vai pro audit_log). */
  async replaceRoleAssignment(userId: string, tenantId: string, newRole: TeamRole): Promise<void> {
    const client = this.requestContext.getClient();
    await client.userRole.deleteMany({ where: { userId, scopeType: 'tenant', scopeId: tenantId } });
    await client.userRole.create({ data: { userId, role: newRole, scopeType: 'tenant', scopeId: tenantId } });
  }

  /** Revoga acesso a este tenant + derruba sessões ativas do staff em qualquer tenant (tokenVersion é global no User). */
  async revokeAccess(userId: string, tenantId: string): Promise<void> {
    const client = this.requestContext.getClient();
    await client.userRole.deleteMany({ where: { userId, scopeType: 'tenant', scopeId: tenantId } });
    await client.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  async recordAuditLog(params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    action: 'team.invite' | 'team.role_update' | 'team.revoke';
    userId: string;
    beforeJson?: Prisma.InputJsonValue;
    afterJson?: Prisma.InputJsonValue;
  }): Promise<void> {
    const client = this.requestContext.getClient();
    await client.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: params.action,
        entity: 'user_role',
        beforeJson: params.beforeJson,
        afterJson: params.afterJson,
      },
    });
  }
}
