import { Body, Controller, ForbiddenException, Get, Inject, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  type SetStaffPinInput,
  setStaffPinSchema,
  type VerifyStaffPinInput,
  verifyStaffPinSchema,
} from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { StaffPinService } from './staff-pin.service';
import { STAFF_PIN_SERVICE } from './cash.tokens';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * PIN de aprovação (Épico 20) — endpoint genérico (docs/HANDOFF-epico-20-pdv-caixa.md),
 * não específico de caixa: qualquer `approval:true` futuro (desconto manual,
 * cancelamento de pedido pago) reusa `verify-pin` sem endpoint novo.
 *
 * ponytail: sem rate limit dedicado neste endpoint — scrypt já encarece
 * brute-force, e é superfície interna (staff autenticado), não anônima.
 * Se um dia sangria/aprovação virar alvo de abuso real, adicionar throttle
 * por (tenantId, approverUserId) aqui.
 */
@Controller('v1/admin/stores/:storeId/staff')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class StaffPinController {
  constructor(@Inject(STAFF_PIN_SERVICE) private readonly pins: StaffPinService) {}

  /** Sempre a PRÓPRIA credencial — userId vem do JWT, nunca do body. */
  @Post('pin')
  async setOwnPin(@Body(new ZodValidationPipe(setStaffPinSchema)) dto: SetStaffPinInput, @Req() req: RequestWithUser) {
    await this.pins.setOwnPin(req.user.sub, dto.pin);
    return { ok: true };
  }

  @Post('verify-pin')
  async verifyPin(@Body(new ZodValidationPipe(verifyStaffPinSchema)) dto: VerifyStaffPinInput, @Req() req: RequestWithUser) {
    if (!req.user) throw new ForbiddenException();
    const valid = await this.pins.verifyPin(dto.userId, dto.pin);
    return { valid };
  }

  /** owner/manager do tenant — a UI de sangria usa isto pra oferecer um SELECT de aprovador, nunca um campo livre de userId. */
  @Get('approvers')
  listApprovers(@Req() req: RequestWithUser) {
    const tenantId = requireTenantIdHeader(req);
    return this.pins.listApprovers(tenantId);
  }
}
