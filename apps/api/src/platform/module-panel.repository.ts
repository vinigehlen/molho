import type { ModuleKey } from '@molho/contracts';
import {
  type EntitlementSource,
  type EntitlementStatus,
  type ModuleCache,
  type ModuleState,
  ModuleService,
  PrismaModuleDataSource,
} from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { ScopeNotFoundError } from './staff-provisioning.errors';

export interface EntitlementRow {
  source: EntitlementSource;
  status: EntitlementStatus;
  trialEndsAt: Date | null;
}

export interface UpsertEntitlementInput {
  source: EntitlementSource;
  status: EntitlementStatus;
  trialEndsAt: Date | null;
}

/**
 * `ModuleService`/`PrismaModuleDataSource` construídos por REQUEST, com o
 * client transacional (mesmo padrão de RequireModuleGuard) — nunca
 * singleton do Nest, mesmo racional de CLAUDE.md § Contexto de request.
 */
export class ModulePanelRepository {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cache: ModuleCache,
  ) {}

  private moduleService(): ModuleService {
    return new ModuleService({ db: new PrismaModuleDataSource(this.requestContext.getClient()), cache: this.cache });
  }

  async assertTenantExists(tenantId: string): Promise<void> {
    const client = this.requestContext.getClient();
    const tenant = await client.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true } });
    if (!tenant) throw new ScopeNotFoundError('tenant', tenantId);
  }

  getModuleStates(tenantId: string): Promise<Record<ModuleKey, ModuleState>> {
    return this.moduleService().getModuleStates(tenantId);
  }

  getModuleState(tenantId: string, moduleKey: ModuleKey): Promise<ModuleState> {
    return this.moduleService().getModuleState(tenantId, moduleKey);
  }

  async getEntitlementRow(tenantId: string, moduleKey: string): Promise<EntitlementRow | null> {
    const client = this.requestContext.getClient();
    return client.tenantEntitlement.findFirst({
      where: { tenantId, moduleKey, deletedAt: null },
      select: { source: true, status: true, trialEndsAt: true },
    });
  }

  /** 1 query pra TODOS os módulos do tenant — o GET da lista não faz N+1. */
  async getAllEntitlementRows(tenantId: string): Promise<Map<string, EntitlementRow>> {
    const client = this.requestContext.getClient();
    const rows = await client.tenantEntitlement.findMany({
      where: { tenantId, deletedAt: null },
      select: { moduleKey: true, source: true, status: true, trialEndsAt: true },
    });
    return new Map(rows.map((r) => [r.moduleKey, r]));
  }

  /**
   * Módulos com entitlement VIVO (active|trialing) — camada de ENTITLEMENT
   * do check de `requires`, distinta do check de `active` que `ModuleService`
   * já faz (aquele também exige enabled+released; aqui só o direito importa,
   * porque é isso que o super-admin está concedendo).
   */
  async getEntitledModuleKeys(tenantId: string): Promise<Set<string>> {
    const client = this.requestContext.getClient();
    const rows = await client.tenantEntitlement.findMany({
      where: { tenantId, deletedAt: null, status: { in: ['active', 'trialing'] } },
      select: { moduleKey: true },
    });
    return new Set(rows.map((r) => r.moduleKey));
  }

  /**
   * PK composta `(tenant_id, module_key)` é SEMPRE totalmente preenchida
   * (nenhum dos dois campos é nullable) — diferente de `user_roles`
   * (scopeId nullable), aqui `upsert()` via `ON CONFLICT` é seguro: só existe
   * UMA linha possível por par, nunca duas colidindo em NULL. `deletedAt` é
   * campo de negócio separado da PK, não controla identidade da linha — por
   * isso revoke NUNCA soft-deleta, só troca `status` (ver module-panel.ts em
   * @molho/contracts).
   */
  async upsertEntitlement(tenantId: string, moduleKey: string, input: UpsertEntitlementInput): Promise<void> {
    const client = this.requestContext.getClient();
    await client.tenantEntitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      create: { tenantId, moduleKey, ...input },
      update: { ...input, deletedAt: null },
    });
    await this.moduleService().invalidate(tenantId, moduleKey as ModuleKey);
  }

  /** module_audit é append-only (trilha do 5-B.5) — grava toda mudança de entitlement. */
  async recordModuleAudit(tenantId: string, moduleKey: string, actorId: string, action: string): Promise<void> {
    const client = this.requestContext.getClient();
    await client.moduleAudit.create({ data: { tenantId, moduleKey, actorId, action } });
  }
}
