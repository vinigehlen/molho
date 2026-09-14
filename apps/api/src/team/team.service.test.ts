import type { InviteTeamMemberInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AlreadyMemberError, CannotManageOwnRoleError, LastOwnerError, RoleNotManageableError, TeamMemberNotFoundError } from './team.errors';
import type { TeamRepository } from './team.repository';
import { TeamService, type TeamActor } from './team.service';

const TENANT_ID = 'tenant-1';
const OWNER_ACTOR: TeamActor = { id: 'owner-1', role: 'owner', subordinatesOnly: false };
const MANAGER_ACTOR: TeamActor = { id: 'manager-1', role: 'manager', subordinatesOnly: true };

function makeRepo(overrides: Partial<TeamRepository> = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    findOrCreateUser: vi.fn().mockResolvedValue({ id: 'user-1', created: true }),
    findRole: vi.fn().mockResolvedValue(null),
    countOwners: vi.fn().mockResolvedValue(2),
    createRoleAssignment: vi.fn().mockResolvedValue(undefined),
    replaceRoleAssignment: vi.fn().mockResolvedValue(undefined),
    revokeAccess: vi.fn().mockResolvedValue(undefined),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TeamRepository;
}

const INVITE: InviteTeamMemberInput = { name: 'Ana', email: 'ana@loja.com', role: 'cashier' };

describe('TeamService.invite', () => {
  it('owner convida qualquer papel lojista', async () => {
    const repo = makeRepo();
    const service = new TeamService(repo);

    const result = await service.invite(INVITE, TENANT_ID, OWNER_ACTOR);

    expect(result.role).toBe('cashier');
    expect(repo.createRoleAssignment).toHaveBeenCalledWith('user-1', 'cashier', TENANT_ID);
    expect(repo.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'team.invite', userId: 'user-1' }));
  });

  it('manager (subordinatesOnly) não convida owner nem manager', async () => {
    const repo = makeRepo();
    const service = new TeamService(repo);

    await expect(service.invite({ ...INVITE, role: 'owner' }, TENANT_ID, MANAGER_ACTOR)).rejects.toThrow(RoleNotManageableError);
    await expect(service.invite({ ...INVITE, role: 'manager' }, TENANT_ID, MANAGER_ACTOR)).rejects.toThrow(RoleNotManageableError);
    expect(repo.findOrCreateUser).not.toHaveBeenCalled();
  });

  it('manager convida cashier normalmente', async () => {
    const repo = makeRepo();
    const service = new TeamService(repo);

    await service.invite(INVITE, TENANT_ID, MANAGER_ACTOR);

    expect(repo.createRoleAssignment).toHaveBeenCalledWith('user-1', 'cashier', TENANT_ID);
  });

  it('e-mail já com papel DIFERENTE neste tenant: erro, não silencioso', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('waiter') });
    const service = new TeamService(repo);

    await expect(service.invite(INVITE, TENANT_ID, OWNER_ACTOR)).rejects.toThrow(AlreadyMemberError);
    expect(repo.createRoleAssignment).not.toHaveBeenCalled();
  });

  it('reenviar convite com MESMO papel: idempotente, não recria', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('cashier') });
    const service = new TeamService(repo);

    await service.invite(INVITE, TENANT_ID, OWNER_ACTOR);

    expect(repo.createRoleAssignment).not.toHaveBeenCalled();
    expect(repo.recordAuditLog).toHaveBeenCalled();
  });
});

describe('TeamService.updateRole', () => {
  it('owner troca papel de staff', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('cashier') });
    const service = new TeamService(repo);

    await service.updateRole('user-2', 'waiter', TENANT_ID, OWNER_ACTOR);

    expect(repo.replaceRoleAssignment).toHaveBeenCalledWith('user-2', TENANT_ID, 'waiter');
  });

  it('ninguém troca o próprio papel por aqui', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('owner') });
    const service = new TeamService(repo);

    await expect(service.updateRole(OWNER_ACTOR.id, 'manager', TENANT_ID, OWNER_ACTOR)).rejects.toThrow(CannotManageOwnRoleError);
  });

  it('staff inexistente no tenant: 404 do domínio', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue(null) });
    const service = new TeamService(repo);

    await expect(service.updateRole('user-x', 'waiter', TENANT_ID, OWNER_ACTOR)).rejects.toThrow(TeamMemberNotFoundError);
  });

  it('manager não mexe em papel de owner nem promove a manager', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('cashier') });
    const service = new TeamService(repo);

    await expect(service.updateRole('user-2', 'manager', TENANT_ID, MANAGER_ACTOR)).rejects.toThrow(RoleNotManageableError);
  });

  it('rebaixar o último owner é bloqueado', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('owner'), countOwners: vi.fn().mockResolvedValue(1) });
    const service = new TeamService(repo);

    await expect(service.updateRole('user-2', 'manager', TENANT_ID, OWNER_ACTOR)).rejects.toThrow(LastOwnerError);
    expect(repo.replaceRoleAssignment).not.toHaveBeenCalled();
  });
});

describe('TeamService.revoke', () => {
  it('owner revoga cashier: apaga acesso e audita', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('cashier') });
    const service = new TeamService(repo);

    await service.revoke('user-2', TENANT_ID, OWNER_ACTOR);

    expect(repo.revokeAccess).toHaveBeenCalledWith('user-2', TENANT_ID);
    expect(repo.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'team.revoke' }));
  });

  it('revogar o último owner é bloqueado', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('owner'), countOwners: vi.fn().mockResolvedValue(1) });
    const service = new TeamService(repo);

    await expect(service.revoke('user-2', TENANT_ID, OWNER_ACTOR)).rejects.toThrow(LastOwnerError);
    expect(repo.revokeAccess).not.toHaveBeenCalled();
  });

  it('ninguém revoga o próprio acesso por aqui', async () => {
    const repo = makeRepo({ findRole: vi.fn().mockResolvedValue('cashier') });
    const service = new TeamService(repo);

    await expect(service.revoke(MANAGER_ACTOR.id, TENANT_ID, MANAGER_ACTOR)).rejects.toThrow(CannotManageOwnRoleError);
  });
});
