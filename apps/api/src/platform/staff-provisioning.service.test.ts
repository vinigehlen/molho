import type { ProvisionStaffInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { StaffProvisioningRepository } from './staff-provisioning.repository';
import { StaffProvisioningService } from './staff-provisioning.service';

const INPUT: ProvisionStaffInput = {
  email: 'Gerente@Loja.com',
  role: 'owner',
  scopeType: 'tenant',
  scopeId: 'tenant-1',
};
const ACTOR = { id: 'admin-1', role: 'platform.superadmin' };

function makeRepo(overrides: Partial<StaffProvisioningRepository> = {}) {
  return {
    assertScopeExists: vi.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
    findOrCreateUser: vi.fn().mockResolvedValue({ id: 'user-1', created: true }),
    hasRoleAssignment: vi.fn().mockResolvedValue(false),
    createRoleAssignment: vi.fn().mockResolvedValue(undefined),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StaffProvisioningRepository;
}

describe('StaffProvisioningService', () => {
  it('cria user novo + papel novo: created=true, grava role e audit', async () => {
    const repo = makeRepo();
    const service = new StaffProvisioningService(repo);

    const result = await service.provision(INPUT, ACTOR);

    expect(result).toEqual({ userId: 'user-1', role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1', created: true });
    expect(repo.createRoleAssignment).toHaveBeenCalledWith('user-1', 'owner', 'tenant', 'tenant-1');
    expect(repo.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', actorRole: 'platform.superadmin', userId: 'user-1' }),
    );
  });

  it('e-mail já normalizado (parseEmail) antes de ir pro repositório', async () => {
    const repo = makeRepo();
    const service = new StaffProvisioningService(repo);

    await service.provision(INPUT, ACTOR);

    expect(repo.findOrCreateUser).toHaveBeenCalledWith('gerente@loja.com');
  });

  it('rodar 2x com o mesmo (email, role, scope): 2ª vez created=false, NÃO recria o papel', async () => {
    const repo = makeRepo({
      findOrCreateUser: vi.fn().mockResolvedValue({ id: 'user-1', created: false }),
      hasRoleAssignment: vi.fn().mockResolvedValue(true),
    });
    const service = new StaffProvisioningService(repo);

    const result = await service.provision(INPUT, ACTOR);

    expect(result.created).toBe(false);
    expect(repo.createRoleAssignment).not.toHaveBeenCalled();
    // idempotente não significa silencioso: audita mesmo sem mudança de estado.
    expect(repo.recordAuditLog).toHaveBeenCalled();
  });

  it('scopeId inexistente propaga o erro do repositório sem criar user nem papel', async () => {
    const scopeError = new Error('não encontrado');
    const repo = makeRepo({ assertScopeExists: vi.fn().mockRejectedValue(scopeError) });
    const service = new StaffProvisioningService(repo);

    await expect(service.provision(INPUT, ACTOR)).rejects.toThrow(scopeError);
    expect(repo.findOrCreateUser).not.toHaveBeenCalled();
    expect(repo.createRoleAssignment).not.toHaveBeenCalled();
  });
});
