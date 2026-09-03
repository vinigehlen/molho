import type { EmailAddress } from '@molho/contracts';
import { decryptEmail } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface ImpersonationTenant {
  id: string;
  slug: string;
  name: string;
}

export class ImpersonationRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findTenant(tenantId: string): Promise<ImpersonationTenant | null> {
    const client = this.requestContext.getClient();
    return client.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, slug: true, name: true },
    });
  }

  /**
   * E-mail do PRIMEIRO owner do tenant (mesmo critério de
   * signup-provisioning.service.ts: `orderBy createdAt asc`) — é quem recebe
   * o aviso de impersonation. `null` quando o owner nasceu por telefone (sem
   * e-mail) ou não tem owner ainda: o caller trata como "sem quem notificar",
   * nunca como erro — impersonation não pode travar numa loja sem e-mail
   * cadastrado.
   */
  async findOwnerEmail(tenantId: string): Promise<EmailAddress | null> {
    const client = this.requestContext.getClient();
    const ownerRole = await client.userRole.findFirst({
      where: { role: 'owner', scopeType: 'tenant', scopeId: tenantId },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!ownerRole) return null;

    const user = await client.user.findUnique({
      where: { id: ownerRole.userId },
      select: { emailCiphertext: true, emailKeyVersion: true },
    });
    if (!user?.emailCiphertext) return null;

    return decryptEmail(Buffer.from(user.emailCiphertext), user.emailKeyVersion) as EmailAddress;
  }

  /** Evento mais sensível da plataforma (CLAUDE.md regra 9) — grava SEMPRE, mesmo se o e-mail de aviso falhar depois. */
  async recordAuditLog(params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    reason: string;
    readOnly: boolean;
    expiresAt: Date;
  }): Promise<void> {
    const client = this.requestContext.getClient();
    await client.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'platform.impersonation_start',
        entity: 'tenant',
        afterJson: {
          reason: params.reason,
          readOnly: params.readOnly,
          expiresAt: params.expiresAt.toISOString(),
        },
      },
    });
  }
}
