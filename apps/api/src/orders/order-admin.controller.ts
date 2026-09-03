import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AdminOrder, OrderNotificationResponse } from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { AdminOrderRepository } from './admin-order.repository';
import { FlagOrderDto } from './dto/flag-order.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { OrderExceptionFilter } from './order-exception.filter';
import type { OrderFlagService } from './order-flag.service';
import type { OrderNotificationService } from './order-notification.service';
import type { OrderStatusService } from './order-status.service';
import { ADMIN_ORDER_REPOSITORY, ORDER_FLAG_SERVICE, ORDER_NOTIFICATION_SERVICE, ORDER_STATUS_SERVICE } from './orders.tokens';
import { OrderPublishInterceptor, queueOrderPublish } from './realtime/order-publish.interceptor';

/**
 * Ações de staff sobre um pedido já existente — a transição de status do gestor
 * (Épico 9). Gate no módulo `orders` (core) + permissão `order.update_status`,
 * separado do OrderPaymentController (gate `payments.pix_static`) porque são
 * módulos diferentes; convivem no mesmo path base (rotas distintas).
 */
@Controller('v1/admin/orders')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
// OrderPublishInterceptor ANTES do TenantContextInterceptor de propósito: como
// interceptor OUTER, seu flush pós-handler roda depois do commit da transação
// (ver order-publish.interceptor.ts).
@UseInterceptors(OrderPublishInterceptor, TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('orders')
export class OrderAdminController {
  constructor(
    @Inject(ORDER_STATUS_SERVICE) private readonly orderStatus: OrderStatusService,
    @Inject(ADMIN_ORDER_REPOSITORY) private readonly orders: AdminOrderRepository,
    @Inject(ORDER_FLAG_SERVICE) private readonly orderFlag: OrderFlagService,
    @Inject(ORDER_NOTIFICATION_SERVICE) private readonly orderNotification: OrderNotificationService,
  ) {}

  /** Board do gestor: pedidos ativos do tenant (load inicial + refetch na reconexão). */
  @Get()
  @RequirePermission('order.view')
  listActive(): Promise<AdminOrder[]> {
    return this.orders.listActive();
  }

  /** Um pedido — o refetch que o cliente faz ao receber um cutuque do stream (passa pela RLS). */
  @Get(':id')
  @RequirePermission('order.view')
  async findOne(@Param('id') id: string): Promise<AdminOrder> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }

  /**
   * Telefone do cliente pro click-to-chat (Épico 11) — buscado SOB DEMANDA, no
   * clique do botão, nunca no payload do board.
   *
   * `@RequireModule('notify.whatsapp_ctc')` no método SOBRESCREVE o `orders` da
   * classe (`getAllAndOverride`: handler vence). Sem perda: `orders` é
   * `core: true`, sempre ativo — o gate que importa aqui é o do módulo de
   * notificação, que o lojista pode desligar.
   */
  @Get(':id/customer-phone')
  @RequireModule('notify.whatsapp_ctc')
  @RequirePermission('order.view')
  async customerPhone(@Param('id') id: string): Promise<{ phone: string }> {
    const phone = await this.orders.findCustomerPhoneForChat(id);
    if (!phone) throw new NotFoundException('Pedido não encontrado.');
    return { phone };
  }

  /**
   * Registra que o lojista iniciou um aviso por WhatsApp. Não prova envio
   * (quem envia é humano, fora do Molho), mas dá rastro operacional suficiente
   * pro board mostrar "cliente já foi chamado".
   */
  @Post(':id/notifications')
  @RequireModule('notify.whatsapp_ctc')
  @RequirePermission('order.update_status')
  @HttpCode(HttpStatus.CREATED)
  async notify(@Param('id') id: string, @Req() req: RequestWithUser): Promise<OrderNotificationResponse> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    const notification = await this.orderNotification.create({
      orderId: id,
      actorId: req.user.sub,
      actorRole: role,
    });
    queueOrderPublish(req, tenantId, { orderId: id, event: 'notification_logged', version: Date.parse(notification.createdAt) });
    return notification;
  }

  @Patch(':id/status')
  @RequirePermission('order.update_status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async transition(
    @Param('id') id: string,
    @Body() dto: TransitionOrderDto,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<void> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    await this.orderStatus.transition({
      orderId: id,
      expectedVersion: dto.version,
      toStatus: dto.toStatus,
      actor: { type: 'staff', userId: req.user.sub, role },
      reason: dto.reason ?? null,
      // Fila offline (Épico 9): retry com a mesma chave não re-aplica. Ausente numa ação online direta.
      idempotencyKey: idempotencyKey ?? null,
    });

    // Enfileira o cutuque — o flush (publish) acontece DEPOIS do commit, no
    // OrderPublishInterceptor. version = dto.version+1 (lock otimista aplicou).
    queueOrderPublish(req, tenantId, { orderId: id, event: 'status_changed', version: dto.version + 1 });
  }

  /**
   * Sinalizar/dessinalizar pendência (Fase 3, plano do gestor — versão MVP
   * manual da "tag de pendência" do iFood). Mesma permissão de transição:
   * quem pode mexer no andamento do pedido pode marcar "precisa de atenção".
   */
  @Patch(':id/flag')
  @RequirePermission('order.update_status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async flag(
    @Param('id') id: string,
    @Body() dto: FlagOrderDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    await this.orderFlag.setFlag({
      orderId: id,
      expectedVersion: dto.version,
      flagged: dto.flagged,
      reason: dto.reason ?? null,
      actor: { userId: req.user.sub, role },
    });

    queueOrderPublish(req, tenantId, { orderId: id, event: 'status_changed', version: dto.version + 1 });
  }
}

/** Mesmo critério do OrderPaymentController: escolhe QUAL papel vira actor_role no audit_log (o guard já garantiu cobertura). */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
