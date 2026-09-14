import type { RequestContextService } from '../context/request-context.service';

export interface StaffPinRepository {
  setPinHash(userId: string, pinHash: string): Promise<void>;
  getPinHash(userId: string): Promise<string | null>;
  /** owner/manager são os únicos papéis sem `approval:true` pra `cash.withdraw` (packages/contracts/src/permissions.ts) — é isso que qualifica alguém a APROVAR a sangria de outro ator. */
  hasApproverRole(tenantId: string, userId: string): Promise<boolean>;
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

  async hasApproverRole(tenantId: string, userId: string): Promise<boolean> {
    const role = await this.requestContext.getClient().userRole.findFirst({
      where: {
        userId,
        role: { in: [...APPROVER_ROLES] },
        OR: [
          { scopeType: 'platform' },
          { scopeType: 'tenant', scopeId: tenantId },
        ],
      },
      select: { id: true },
    });
    return role !== null;
  }
}
