import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { CUSTOMER_TOKEN_SERVICE } from '../token/token.module';
import type { TokenService } from '../token/token.service';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../token/token-errors';
import type { TokenPayload } from '../token/token-payload';

export type RequestWithCustomer = Request & { user: TokenPayload };

const BEARER_PREFIX = 'Bearer ';

/**
 * Mesmo papel de `JwtAuthGuard`, mas pro token de CLIENTE (CUSTOMER_TOKEN_SERVICE
 * — customers.token_version). `isPlatform: true` aqui só serve pra ler
 * token_version sem depender de contexto de tenant nenhum — `app_tenant_visible`
 * (RLS) deixa passar qualquer linha quando is_platform é true, exatamente como
 * pro staff. Isso NÃO significa que o customerId do token pertence ao tenant
 * do :slug da rota: quem usa este guard (checkout, Épico 7) TEM que confirmar
 * isso de novo dentro do contexto de tenant do handler (RLS tenant-scoped
 * normal) antes de gravar qualquer coisa — a FK composta (customer_id,
 * tenant_id) em `orders` também barra na escrita, mas um 404 explícito é
 * melhor do que deixar estourar erro de constraint.
 */
@Injectable()
export class CustomerJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithCustomer>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Token de acesso ausente.');
    }
    const token = header.slice(BEARER_PREFIX.length);

    try {
      request.user = await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () => this.tokenService.verifyAccessToken(token),
      );
    } catch (error) {
      if (
        error instanceof ExpiredTokenError ||
        error instanceof RevokedTokenError ||
        error instanceof InvalidTokenError
      ) {
        throw new UnauthorizedException('Token de acesso inválido.');
      }
      throw error;
    }

    return true;
  }
}
