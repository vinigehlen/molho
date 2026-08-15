import type { EmailAddress } from '@molho/contracts';
import { encryptEmail, hashEmailForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { ScopeNotFoundError } from './staff-provisioning.errors';

export interface ProvisionedIdentity {
  id: string;
  created: boolean;
}

type Scope = 'tenant' | 'store';

/**
 * Reusa a mesma chave de identidade do staff-auth (e-mail → hash → User
 * global, sem tenant_id — ver staff-identity.repository.ts): provisionar
 * aqui e logar depois pelo OTP normal têm que bater no MESMO registro.
 */
export class StaffProvisioningRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  /**
   * findFirst+create, NUNCA upsert por e-mail — `users_active_email_hash` é
   * índice único PARCIAL (`deleted_at IS NULL`), mas dois requests
   * concorrentes ainda correm pro `create`; nesse caso o índice rejeita o
   * perdedor (P2002) e cabe ao chamador tratar como corrida rara, não como
   * bug (mesmo racional do comentário em staff-identity.repository.ts).
   */
  async findOrCreateUser(email: EmailAddress): Promise<ProvisionedIdentity> {
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
        name: email,
        emailCiphertext: new Uint8Array(ciphertext),
        emailLookupHash: emailHash,
        emailKeyVersion: keyVersion,
      },
      select: { id: true },
    });
    return { id: user.id, created: true };
  }

  /** scopeId inexistente vira 404/400 explícito — nunca deixa a FK crua estourar 500. */
  async assertScopeExists(scopeType: Scope, scopeId: string): Promise<{ tenantId: string }> {
    const client = this.requestContext.getClient();
    if (scopeType === 'tenant') {
      const tenant = await client.tenant.findFirst({ where: { id: scopeId, deletedAt: null }, select: { id: true } });
      if (!tenant) throw new ScopeNotFoundError('tenant', scopeId);
      return { tenantId: tenant.id };
    }
    const store = await client.store.findFirst({ where: { id: scopeId, deletedAt: null }, select: { tenantId: true } });
    if (!store) throw new ScopeNotFoundError('store', scopeId);
    return { tenantId: store.tenantId };
  }

  /**
   * `user_roles_user_id_role_scope_type_scope_id_key` é único COMUM (não
   * parcial/COALESCE) — aqui scopeId é sempre não-nulo (schema já barra
   * escopo platform), mas findFirst+create em vez de upsert é o mesmo padrão
   * do resto do arquivo, por consistência com seed/superadmin.ts.
   */
  async hasRoleAssignment(userId: string, role: string, scopeType: Scope, scopeId: string): Promise<boolean> {
    const client = this.requestContext.getClient();
    const existing = await client.userRole.findFirst({ where: { userId, role, scopeType, scopeId } });
    return existing !== null;
  }

  async createRoleAssignment(userId: string, role: string, scopeType: Scope, scopeId: string): Promise<void> {
    const client = this.requestContext.getClient();
    await client.userRole.create({ data: { userId, role, scopeType, scopeId } });
  }

  /** Atribuição de papel é evento sensível (CLAUDE.md regra 9/15) — grava sempre, idempotente ou não. */
  async recordAuditLog(params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    userId: string;
    role: string;
    scopeType: Scope;
    scopeId: string;
    created: boolean;
  }): Promise<void> {
    const client = this.requestContext.getClient();
    await client.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'platform.staff_provision',
        entity: 'user_role',
        afterJson: {
          userId: params.userId,
          role: params.role,
          scopeType: params.scopeType,
          scopeId: params.scopeId,
          userCreated: params.created,
        },
      },
    });
  }
}
