import type { PrismaClient } from '../../prisma/generated/client/client';

export interface EntitlementRow {
  status: 'active' | 'trialing' | 'suspended';
}

export interface SettingRow {
  enabled: boolean;
}

export interface FlagRow {
  enabled: boolean;
}

/**
 * Porta pro banco. Esconde o Prisma de ModuleService — testes usam um fake
 * com 3 métodos, sem precisar mockar o Prisma Client inteiro.
 */
export interface ModuleDataSource {
  getEntitlement(tenantId: string, moduleKey: string): Promise<EntitlementRow | null>;
  getSetting(tenantId: string, moduleKey: string): Promise<SettingRow | null>;
  getFlag(moduleKey: string): Promise<FlagRow | null>;
}

export class PrismaModuleDataSource implements ModuleDataSource {
  constructor(private readonly prisma: PrismaClient) {}

  async getEntitlement(tenantId: string, moduleKey: string): Promise<EntitlementRow | null> {
    // findFirst (não findUnique): precisa combinar a PK composta com
    // deletedAt IS NULL — soft-deleted não conta como entitled.
    const row = await this.prisma.tenantEntitlement.findFirst({
      where: { tenantId, moduleKey, deletedAt: null },
      select: { status: true },
    });
    return row;
  }

  async getSetting(tenantId: string, moduleKey: string): Promise<SettingRow | null> {
    const row = await this.prisma.tenantSetting.findFirst({
      where: { tenantId, moduleKey, deletedAt: null },
      select: { enabled: true },
    });
    return row;
  }

  async getFlag(moduleKey: string): Promise<FlagRow | null> {
    const row = await this.prisma.featureFlag.findUnique({
      where: { key: moduleKey },
      select: { enabled: true },
    });
    return row;
  }
}
