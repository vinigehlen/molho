import { MODULE_KEYS, type SetEntitlementInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CoreModuleError, InvalidModuleKeyError } from './module-panel.errors';
import type { ModulePanelRepository } from './module-panel.repository';
import { ModulePanelService } from './module-panel.service';

const TENANT = 'tenant-1';
const ACTIVE_STATE = { entitled: true, enabled: true, released: true, active: true };
const NONE_STATE = { entitled: false, enabled: false, released: true, active: false };

function makeRepo(overrides: Partial<ModulePanelRepository> = {}) {
  return {
    assertTenantExists: vi.fn().mockResolvedValue(undefined),
    getModuleStates: vi.fn().mockResolvedValue({}),
    getModuleState: vi.fn().mockResolvedValue(NONE_STATE),
    getEntitlementRow: vi.fn().mockResolvedValue(null),
    getAllEntitlementRows: vi.fn().mockResolvedValue(new Map()),
    getEntitledModuleKeys: vi.fn().mockResolvedValue(new Set()),
    upsertEntitlement: vi.fn().mockResolvedValue(undefined),
    recordModuleAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ModulePanelRepository;
}

describe('ModulePanelService.getModuleStates', () => {
  it('filtra módulos core da lista', async () => {
    // ModuleService.getModuleStates() real devolve TODOS os MODULE_KEYS —
    // o fake espelha isso (o service indexa states[key] sem checar undefined).
    const allStates = Object.fromEntries(MODULE_KEYS.map((key) => [key, NONE_STATE]));
    allStates['delivery.zones'] = ACTIVE_STATE;
    const repo = makeRepo({ getModuleStates: vi.fn().mockResolvedValue(allStates) });
    const service = new ModulePanelService(repo);

    const list = await service.getModuleStates(TENANT);

    expect(list.some((m) => m.moduleKey === 'catalog')).toBe(false);
    expect(list.some((m) => m.moduleKey === 'delivery.zones')).toBe(true);
  });

  it('tenant inexistente propaga o erro do repositório', async () => {
    const notFound = new Error('não encontrado');
    const repo = makeRepo({ assertTenantExists: vi.fn().mockRejectedValue(notFound) });
    const service = new ModulePanelService(repo);

    await expect(service.getModuleStates(TENANT)).rejects.toThrow(notFound);
  });
});

describe('ModulePanelService.setEntitlement', () => {
  const grant: SetEntitlementInput = { status: 'active' } as SetEntitlementInput;
  const revoke: SetEntitlementInput = { status: 'revoked' } as SetEntitlementInput;
  const trial: SetEntitlementInput = { status: 'trial', trialEndsAt: '2026-09-01T00:00:00Z' } as SetEntitlementInput;

  it('moduleKey fora do registry: InvalidModuleKeyError, nunca toca no banco', async () => {
    const repo = makeRepo();
    const service = new ModulePanelService(repo);

    await expect(service.setEntitlement(TENANT, 'nao-existe', grant, 'admin-1')).rejects.toThrow(
      InvalidModuleKeyError,
    );
    expect(repo.assertTenantExists).not.toHaveBeenCalled();
  });

  it('módulo core: CoreModuleError, nunca toca no banco', async () => {
    const repo = makeRepo();
    const service = new ModulePanelService(repo);

    await expect(service.setEntitlement(TENANT, 'catalog', grant, 'admin-1')).rejects.toThrow(CoreModuleError);
    expect(repo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it('grant com requires não-entitled: 409 (MissingRequirementsError) listando o que falta', async () => {
    // channel.qrcode_table requires 'tables' — nenhum entitled no fake repo.
    const repo = makeRepo({ getEntitledModuleKeys: vi.fn().mockResolvedValue(new Set()) });
    const service = new ModulePanelService(repo);

    await expect(service.setEntitlement(TENANT, 'channel.qrcode_table', grant, 'admin-1')).rejects.toMatchObject({
      missing: ['tables'],
    });
    expect(repo.upsertEntitlement).not.toHaveBeenCalled();
  });

  it('grant com requires já entitled: upsert + audit "grant"', async () => {
    const repo = makeRepo({ getEntitledModuleKeys: vi.fn().mockResolvedValue(new Set(['tables'])) });
    const service = new ModulePanelService(repo);

    await service.setEntitlement(TENANT, 'channel.qrcode_table', grant, 'admin-1');

    expect(repo.upsertEntitlement).toHaveBeenCalledWith(TENANT, 'channel.qrcode_table', {
      source: 'manual',
      status: 'active',
      trialEndsAt: null,
    });
    expect(repo.recordModuleAudit).toHaveBeenCalledWith(TENANT, 'channel.qrcode_table', 'admin-1', 'grant');
  });

  it('trial: status="trialing" no banco, trialEndsAt convertido, audit "trial"', async () => {
    const repo = makeRepo();
    const service = new ModulePanelService(repo);

    await service.setEntitlement(TENANT, 'coupons', trial, 'admin-1');

    expect(repo.upsertEntitlement).toHaveBeenCalledWith(TENANT, 'coupons', {
      source: 'manual',
      status: 'trialing',
      trialEndsAt: new Date('2026-09-01T00:00:00Z'),
    });
    expect(repo.recordModuleAudit).toHaveBeenCalledWith(TENANT, 'coupons', 'admin-1', 'trial');
  });

  it('revoke: NUNCA checa requires (sempre ok mesmo com dependentes)', async () => {
    const repo = makeRepo();
    const service = new ModulePanelService(repo);

    await service.setEntitlement(TENANT, 'coupons', revoke, 'admin-1');

    expect(repo.getEntitledModuleKeys).not.toHaveBeenCalled();
    expect(repo.upsertEntitlement).toHaveBeenCalledWith(TENANT, 'coupons', {
      source: 'manual',
      status: 'suspended',
      trialEndsAt: null,
    });
    expect(repo.recordModuleAudit).toHaveBeenCalledWith(TENANT, 'coupons', 'admin-1', 'revoke');
  });
});
