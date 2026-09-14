import type { CashSessionResponse } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CashSessionRepository } from './cash-session.repository';
import { CashSessionService } from './cash-session.service';
import type { StaffPinRepository } from './staff-pin.repository';
import { StaffPinService } from './staff-pin.service';
import {
  CashSessionNotFoundError,
  CashWithdrawalApprovalRequiredError,
  CashWithdrawalInvalidPinError,
  CashWithdrawalNotAllowedError,
} from './cash.errors';

const TENANT_ID = 'tenant-1';
const STORE_ID = 'store-1';
const SESSION_ID = 'session-1';
const OWNER = { id: 'owner-1', role: 'owner' };
const MANAGER = { id: 'manager-1', role: 'manager' };
const CASHIER = { id: 'cashier-1', role: 'cashier' };

function openSession(overrides: Partial<CashSessionResponse> = {}): CashSessionResponse {
  return {
    id: SESSION_ID,
    storeId: STORE_ID,
    status: 'open',
    openedAt: new Date().toISOString(),
    openedByUserId: CASHIER.id,
    openingAmountCents: 10_000,
    closedAt: null,
    closedByUserId: null,
    countedAmountCents: null,
    expectedAmountCents: null,
    version: 0,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<CashSessionRepository> = {}): CashSessionRepository {
  return {
    getOpenForStore: vi.fn().mockResolvedValue(openSession()),
    open: vi.fn(),
    close: vi.fn().mockResolvedValue(openSession({ status: 'closed' })),
    createWithdrawal: vi.fn().mockImplementation((sessionId, amountCents, reason, requestedByUserId, approvedByUserId) =>
      Promise.resolve({
        id: 'withdrawal-1',
        cashSessionId: sessionId,
        amountCents,
        reason: reason ?? null,
        requestedByUserId,
        approvedByUserId,
        createdAt: new Date().toISOString(),
      }),
    ),
    listClosedForPeriod: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makePinRepo(overrides: Partial<StaffPinRepository> = {}): StaffPinRepository {
  return {
    setPinHash: vi.fn(),
    getPinHash: vi.fn().mockResolvedValue(null),
    hasApproverRole: vi.fn().mockResolvedValue(false),
    listApprovers: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('CashSessionService.createWithdrawal', () => {
  it('owner/manager auto-aprovam — approvedByUserId = requestedByUserId, sem checar PIN', async () => {
    const repo = makeRepo();
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    const result = await service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, OWNER, { amountCents: 5000 });

    expect(result.requestedByUserId).toBe(OWNER.id);
    expect(result.approvedByUserId).toBe(OWNER.id);
    expect(pinRepo.getPinHash).not.toHaveBeenCalled();
  });

  it('cashier sem approverUserId/approverPin: CashWithdrawalApprovalRequiredError', async () => {
    const repo = makeRepo();
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await expect(
      service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, { amountCents: 5000 }),
    ).rejects.toThrow(CashWithdrawalApprovalRequiredError);
  });

  it('cashier com approver que NÃO é owner/manager: CashWithdrawalApprovalRequiredError', async () => {
    const repo = makeRepo();
    const pinRepo = makePinRepo({ hasApproverRole: vi.fn().mockResolvedValue(false) });
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await expect(
      service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, {
        amountCents: 5000,
        approverUserId: 'someone-1',
        approverPin: '1234',
      }),
    ).rejects.toThrow(CashWithdrawalApprovalRequiredError);
  });

  it('cashier com approver owner/manager mas PIN errado: CashWithdrawalInvalidPinError', async () => {
    const repo = makeRepo();
    const pinRepo = makePinRepo({
      hasApproverRole: vi.fn().mockResolvedValue(true),
      getPinHash: vi.fn().mockResolvedValue(null), // sem PIN cadastrado = nunca bate
    });
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await expect(
      service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, {
        amountCents: 5000,
        approverUserId: MANAGER.id,
        approverPin: '1234',
      }),
    ).rejects.toThrow(CashWithdrawalInvalidPinError);
  });

  it('cashier com approver owner/manager e PIN certo: aprova, approvedByUserId = approver', async () => {
    const repo = makeRepo();
    let storedHash: string | undefined;
    const pinRepo = makePinRepo({
      hasApproverRole: vi.fn().mockResolvedValue(true),
      setPinHash: vi.fn().mockImplementation((_userId, hash) => {
        storedHash = hash;
        return Promise.resolve();
      }),
      getPinHash: vi.fn().mockImplementation(() => Promise.resolve(storedHash ?? null)),
    });
    const pins = new StaffPinService(pinRepo);
    await pins.setOwnPin(MANAGER.id, '1234'); // simula PIN cadastrado antes desta sangria
    const service = new CashSessionService(repo, pins, pinRepo);

    const result = await service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, {
      amountCents: 5000,
      approverUserId: MANAGER.id,
      approverPin: '1234',
    });

    expect(result.requestedByUserId).toBe(CASHIER.id);
    expect(result.approvedByUserId).toBe(MANAGER.id);
  });

  it('papel sem cash.withdraw (waiter, por exemplo): CashWithdrawalNotAllowedError', async () => {
    const repo = makeRepo();
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await expect(
      service.createWithdrawal(TENANT_ID, STORE_ID, SESSION_ID, { id: 'waiter-1', role: 'waiter' }, { amountCents: 5000 }),
    ).rejects.toThrow(CashWithdrawalNotAllowedError);
  });
});

describe('CashSessionService.close', () => {
  it('owner fecha qualquer sessão da loja (não precisa ter aberto ele mesmo)', async () => {
    const repo = makeRepo({ getOpenForStore: vi.fn().mockResolvedValue(openSession({ openedByUserId: CASHIER.id })) });
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await service.close(TENANT_ID, STORE_ID, SESSION_ID, OWNER, 15_000, 0);
    expect(repo.close).toHaveBeenCalledWith(SESSION_ID, OWNER.id, 15_000, 0);
  });

  it('cashier só fecha a sessão que ELE abriu — sessão de outro cashier: CashSessionNotFoundError', async () => {
    const repo = makeRepo({ getOpenForStore: vi.fn().mockResolvedValue(openSession({ openedByUserId: 'outro-cashier' })) });
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await expect(service.close(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, 15_000, 0)).rejects.toThrow(
      CashSessionNotFoundError,
    );
    expect(repo.close).not.toHaveBeenCalled();
  });

  it('cashier fecha a PRÓPRIA sessão sem problema', async () => {
    const repo = makeRepo({ getOpenForStore: vi.fn().mockResolvedValue(openSession({ openedByUserId: CASHIER.id })) });
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    await service.close(TENANT_ID, STORE_ID, SESSION_ID, CASHIER, 15_000, 0);
    expect(repo.close).toHaveBeenCalledWith(SESSION_ID, CASHIER.id, 15_000, 0);
  });
});

describe('CashSessionService.report', () => {
  it('soma os totais em cima das linhas devolvidas pelo repo', async () => {
    const repo = makeRepo({
      listClosedForPeriod: vi.fn().mockResolvedValue([
        {
          id: 's1',
          openedByUserId: 'u1',
          closedByUserId: 'u1',
          openedAt: '2026-09-01T10:00:00.000Z',
          closedAt: '2026-09-01T18:00:00.000Z',
          openingAmountCents: 10_000,
          countedAmountCents: 50_000,
          expectedAmountCents: 49_000,
          discrepancyCents: 1000,
          withdrawalsCents: 20_000,
        },
        {
          id: 's2',
          openedByUserId: 'u2',
          closedByUserId: 'u2',
          openedAt: '2026-09-02T10:00:00.000Z',
          closedAt: '2026-09-02T18:00:00.000Z',
          openingAmountCents: 5000,
          countedAmountCents: 30_000,
          expectedAmountCents: 31_000,
          discrepancyCents: -1000,
          withdrawalsCents: 0,
        },
      ]),
    });
    const pinRepo = makePinRepo();
    const service = new CashSessionService(repo, new StaffPinService(pinRepo), pinRepo);

    const result = await service.report(STORE_ID, new Date('2026-09-01'), new Date('2026-09-02'));

    expect(result.sessions).toHaveLength(2);
    expect(result.totals).toEqual({
      openingAmountCents: 15_000,
      countedAmountCents: 80_000,
      expectedAmountCents: 80_000,
      discrepancyCents: 0,
      withdrawalsCents: 20_000,
    });
  });
});
