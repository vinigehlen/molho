import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { TokenPayload } from '../token/token-payload';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';

/** `user` ausente = request anônima (candidata a checkout guest), NUNCA "token que falhou". */
export type RequestWithOptionalCustomer = Request & { user?: TokenPayload };

/**
 * Deixa passar a request SEM `Authorization` — pro checkout guest (CLAUDE.md
 * regra 13, EMENDA). Quem decide se anônimo é aceitável é o
 * `CheckoutOrderService`, que checa o módulo `checkout.guest` do tenant; aqui
 * só se resolve a IDENTIDADE, nunca a autorização.
 *
 * **Header presente ⇒ delega pro `CustomerJwtAuthGuard` inteiro**, com o
 * comportamento dele intacto: token inválido, expirado ou revogado continua
 * 401 e NUNCA cai pro caminho guest. Esse downgrade silencioso é exatamente o
 * que a delegação impede — reimplementar a verificação aqui abriria a chance
 * de as duas divergirem num fix futuro.
 */
@Injectable()
export class OptionalCustomerJwtAuthGuard implements CanActivate {
  constructor(@Inject(CustomerJwtAuthGuard) private readonly strict: CustomerJwtAuthGuard) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.headers.authorization) return true;
    return this.strict.canActivate(context);
  }
}
