import type { RequestContextService } from '../context/request-context.service';

export interface StaffApproverRow {
  id: string;
  name: string;
}

export interface StaffPinRepository {
  setPinHash(userId: string, pinHash: string): Promise<void>;
  getPinHash(userId: string): Promise<string | null>;
  /** owner/manager são os únicos papéis sem `approval:true` pra `cash.withdraw` (packages/contracts/src/permissions.ts) — é isso que qualifica alguém a APROVAR a sangria de outro ator. */
  hasApproverRole(tenantId: string, userId: string): Promise<boolean>;
  /** Pra UI de sangria oferecer QUEM pode aprovar — só nome (dado já público entre colegas de loja), nunca telefone/e-mail. */
  listApprovers(tenantId: string): Promise<StaffApproverRow[]>;
}

const APPROVER_ROLES = ['owner', 'manager'] as const;

export class PrismaStaffPinRepository implements StaffPinRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async setPinHash(userId: string, pinHash: string): Promise<void> {
    await this.requestContext.getClient().user.update({
      where: { id: userId },
      data: { pinHash },
    });
  }

  async getPinHash(userId: string): Promise<string | null> {
    const user = await this.requestContext.getClient().user.findUnique({
      where: { id: userId },
      select: { pinHash: true },
    });
    return user?.pinHash ?? null;
  }

  // Só escopo tenant — owner/manager são papéis DE LOJISTA (packages/contracts/
  // src/permissions.ts), nunca deveriam existir em scopeType:'platform' (isso
  // é pra platform_owner/platform_support/etc). Tinha um `OR: [{scopeType:
  // 'platform'}, ...]` aqui que aceitava um approver que listApprovers()
  // (usado pra montar o dropdown da UI) nunca oferece — os dois caminhos
  // discordavam sobre quem pode aprovar. Mesmo filtro nos dois agora.
  async hasApproverRole(tenantId: string, userId: string): Promise<boolean> {
    const role = await this.requestContext.getClient().userRole.findFirst({
      where: { userId, role: { in: [...APPROVER_ROLES] }, scopeType: 'tenant', scopeId: tenantId },
      select: { id: true },
    });
    return role !== null;
  }

  async listApprovers(tenantId: string): Promise<StaffApproverRow[]> {
    const roles = await this.requestContext.getClient().userRole.findMany({
      where: { role: { in: [...APPROVER_ROLES] }, scopeType: 'tenant', scopeId: tenantId },
      select: { user: { select: { id: true, name: true } } },
      distinct: ['userId'],
    });
    return roles.map((r) => r.user);
  }
}
