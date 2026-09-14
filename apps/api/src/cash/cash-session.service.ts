import type {
  CashSessionResponse,
  CashWithdrawalResponse,
  CreateCashWithdrawalInput,
  CurrentCashSessionResponse,
} from '@molho/contracts';
import { can, isRole, type CanResult } from '@molho/contracts';
import {
  CashSessionNotFoundError,
  CashWithdrawalApprovalRequiredError,
  CashWithdrawalInvalidPinError,
  CashWithdrawalNotAllowedError,
  NoOpenCashSessionError,
} from './cash.errors';
import type { CashSessionRepository } from './cash-session.repository';
import type { StaffPinRepository } from './staff-pin.repository';
import type { StaffPinService } from './staff-pin.service';

export interface CashSessionActor {
  id: string;
  /** Papel EFETIVO já resolvido pelo controller (resolveActorRole) — sempre um Role de packages/contracts/src/permissions.ts. */
  role: string;
}

export class CashSessionService {
  constructor(
    private readonly repo: CashSessionRepository,
    private readonly pins: StaffPinService,
    private readonly pinRepo: StaffPinRepository,
  ) {}

  getCurrent(storeId: string): Promise<CurrentCashSessionResponse> {
    return this.repo.getOpenForStore(storeId);
  }

  open(storeId: string, actor: CashSessionActor, openingAmountCents: number): Promise<CashSessionResponse> {
    return this.repo.open(storeId, actor.id, openingAmountCents);
  }

  /**
   * `cash.open_close` é `selfOnly` pro cashier (matriz §5-C.5: "cashier
   * fecha só o caixa dele") — owner/manager fecham qualquer sessão da loja
   * (handoff de turno, decisão 2 do handoff: quem abre não precisa ser quem
   * fecha). Precisa de `storeId` pra achar QUEM abriu a sessão aberta e
   * decidir se o selfOnly bate.
   */
  async close(
    tenantId: string,
    storeId: string,
    sessionId: string,
    actor: CashSessionActor,
    countedAmountCents: number,
    expectedVersion: number,
  ): Promise<CashSessionResponse> {
    const result = this.resolveCan(tenantId, storeId, actor, 'cash.open_close', CashWithdrawalNotAllowedError);
    if (result.selfOnly) {
      const open = await this.repo.getOpenForStore(storeId);
      if (!open || open.id !== sessionId || open.openedByUserId !== actor.id) {
        throw new CashSessionNotFoundError();
      }
    }
    return this.repo.close(sessionId, actor.id, countedAmountCents, expectedVersion);
  }

  /**
   * owner/manager (sem `approval:true` pra `cash.withdraw`) auto-aprovam —
   * `approvedByUserId = requester.id`. cashier PRECISA de `approverUserId` +
   * `approverPin` de alguém com papel owner/manager NESTE tenant e PIN
   * cadastrado — nunca confia num "sou manager" que venha só do body.
   */
  async createWithdrawal(
    tenantId: string,
    storeId: string,
    sessionId: string,
    actor: CashSessionActor,
    input: CreateCashWithdrawalInput,
  ): Promise<CashWithdrawalResponse> {
    const result = this.resolveCan(tenantId, storeId, actor, 'cash.withdraw', CashWithdrawalNotAllowedError);

    const approvedByUserId = result.requiresApproval
      ? await this.resolveApprover(tenantId, input)
      : actor.id;

    return this.repo.createWithdrawal(sessionId, input.amountCents, input.reason, actor.id, approvedByUserId);
  }

  /** Usado pelo balcão (CounterOrderService) — sessão obrigatória pra vender é regra de APLICAÇÃO, não CHECK de banco (docs/HANDOFF-epico-20-pdv-caixa.md). */
  async requireOpenSessionId(storeId: string): Promise<string> {
    const session = await this.repo.getOpenForStore(storeId);
    if (!session) throw new NoOpenCashSessionError();
    return session.id;
  }

  /** `can()` já foi checado pelo guard na entrada da rota — refeito aqui só pra ler `requiresApproval`/`selfOnly`, que o guard ignora hoje (comentário em require-permission.guard.ts). */
  private resolveCan(
    tenantId: string,
    storeId: string,
    actor: CashSessionActor,
    permission: 'cash.open_close' | 'cash.withdraw',
    onDenied: new () => Error,
  ): CanResult {
    if (!isRole(actor.role)) throw new onDenied();
    const result = can(
      { id: actor.id, assignments: [{ role: actor.role, scopeType: 'tenant', scopeId: tenantId }] },
      permission,
      { tenantId, storeId },
    );
    if (!result.allowed) throw new onDenied();
    return result;
  }

  private async resolveApprover(tenantId: string, input: CreateCashWithdrawalInput): Promise<string> {
    if (!input.approverUserId || !input.approverPin) throw new CashWithdrawalApprovalRequiredError();
    const isApprover = await this.pinRepo.hasApproverRole(tenantId, input.approverUserId);
    if (!isApprover) throw new CashWithdrawalApprovalRequiredError();
    const validPin = await this.pins.verifyPin(input.approverUserId, input.approverPin);
    if (!validPin) throw new CashWithdrawalInvalidPinError();
    return input.approverUserId;
  }
}
