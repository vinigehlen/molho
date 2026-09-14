import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  type CloseCashSessionInput,
  closeCashSessionSchema,
  type CreateCashWithdrawalInput,
  createCashWithdrawalSchema,
  type OpenCashSessionInput,
  openCashSessionSchema,
} from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CASH_SESSION_SERVICE } from './cash.tokens';
import {
  CashSessionAlreadyOpenError,
  CashSessionNotFoundError,
  CashSessionStoreNotFoundError,
  CashSessionVersionConflictError,
  CashWithdrawalApprovalRequiredError,
  CashWithdrawalInvalidPinError,
  CashWithdrawalNotAllowedError,
} from './cash.errors';
import type { CashSessionService } from './cash-session.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Caixa (Épico 20) — uma sessão por LOJA, gate `RequireModule('pdv')`.
 * `cash.open_close` cobre abrir/GET current/fechar; `cash.withdraw` é
 * permissão separada (sangria pode ser negada a quem abre/fecha caixa, e
 * vice-versa, conforme a matriz).
 */
@Controller('v1/admin/stores/:storeId/cash-sessions')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('pdv')
export class CashSessionController {
  constructor(@Inject(CASH_SESSION_SERVICE) private readonly cashSessions: CashSessionService) {}

  @Get('current')
  @RequirePermission('cash.open_close')
  current(@Param('storeId') storeId: string) {
    return this.cashSessions.getCurrent(storeId);
  }

  @Post()
  @RequirePermission('cash.open_close')
  async open(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(openCashSessionSchema)) dto: OpenCashSessionInput,
    @Req() req: RequestWithUser,
  ) {
    const tenantId = requireTenantIdHeader(req);
    const actor = { id: req.user.sub, role: resolveActorRole(req, tenantId) };
    return this.handle(() => this.cashSessions.open(storeId, actor, dto.openingAmountCents));
  }

  @Post(':id/close')
  @RequirePermission('cash.open_close')
  async close(
    @Param('storeId') storeId: string,
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(closeCashSessionSchema)) dto: CloseCashSessionInput,
    @Req() req: RequestWithUser,
  ) {
    const tenantId = requireTenantIdHeader(req);
    const actor = { id: req.user.sub, role: resolveActorRole(req, tenantId) };
    // Optimistic lock: fechamento sempre parte da versão ATUAL da sessão
    // aberta — não é input do body, então não há como o front mandar um
    // número velho de propósito.
    const current = await this.cashSessions.getCurrent(storeId);
    if (!current || current.id !== sessionId) throw new NotFoundException('Sessão de caixa não encontrada ou já fechada.');
    return this.handle(() =>
      this.cashSessions.close(tenantId, storeId, sessionId, actor, dto.countedAmountCents, current.version),
    );
  }

  @Post(':id/withdrawals')
  @RequirePermission('cash.withdraw')
  async withdraw(
    @Param('storeId') storeId: string,
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(createCashWithdrawalSchema)) dto: CreateCashWithdrawalInput,
    @Req() req: RequestWithUser,
  ) {
    const tenantId = requireTenantIdHeader(req);
    const actor = { id: req.user.sub, role: resolveActorRole(req, tenantId) };
    return this.handle(() => this.cashSessions.createWithdrawal(tenantId, storeId, sessionId, actor, dto));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CashSessionStoreNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof CashSessionNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof CashSessionAlreadyOpenError) throw new ConflictException(error.message);
      if (error instanceof CashSessionVersionConflictError) throw new ConflictException(error.message);
      if (error instanceof CashWithdrawalNotAllowedError) throw new ForbiddenException(error.message);
      if (error instanceof CashWithdrawalApprovalRequiredError) throw new BadRequestException(error.message);
      if (error instanceof CashWithdrawalInvalidPinError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

/** Mesmo critério de CounterOrderController/OrderAdminController: escolhe QUAL papel vira ator na ação. */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
