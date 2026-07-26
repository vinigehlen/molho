import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { OrderStatus } from '../order-status-machine';

/**
 * Status DESTINO alcançáveis pelo gestor. Só os "felizes" + os cancelamentos
 * que a loja aciona (docs/02 §5.2). `pending_payment`/`expired`/`auto_canceled`
 * ficam de fora — nascem de timer do PIX online (Épico 24), nunca de ação de
 * staff. A legalidade da transição em si (ex.: received→completed) é validada
 * DEPOIS, na máquina de estados (OrderStatusService) — este IsIn só barra
 * status que staff NUNCA pode pedir.
 */
const STAFF_TARGET_STATUSES: readonly OrderStatus[] = [
  'preparing',
  'ready',
  'in_transit',
  'completed',
  'canceled',
  'delivery_failed',
];

export class TransitionOrderDto {
  @IsIn(STAFF_TARGET_STATUSES as string[])
  toStatus!: OrderStatus;

  /** Lock otimista — não transiciona em cima de um pedido que mudou desde a tela. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  /** Obrigatório só pra canceled/delivery_failed (validado no service, docs/02 §5.2). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
