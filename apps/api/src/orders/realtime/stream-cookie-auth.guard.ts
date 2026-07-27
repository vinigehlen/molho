import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { TOKEN_SERVICE } from '../../auth/token/token.module';
import type { TokenService } from '../../auth/token/token.service';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../../auth/token/token-errors';
import type { RequestWithUser } from '../../auth/guards/jwt-auth.guard';

export const STREAM_COOKIE_NAME = '__Host-molho_stream';

/**
 * Lê o token do cookie `__Host-molho_stream`. Sem cookie-parser (dep nova): o
 * cookie é único e o parsing é trivial. `__Host-` faz parte do NOME do cookie —
 * o browser garante que um cookie com esse prefixo é host-only + Secure + sem
 * Domain, então subdomínio (storefront) não consegue forjá-lo pra api.molho.live
 * (desenho do Épico 9, defesa contra cookie tossing).
 */
export function readStreamCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === STREAM_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Auth do stream SSE por COOKIE, não por header — `EventSource` nativo não
 * manda `Authorization`. Valida o access token exatamente como o JwtAuthGuard
 * (mesmo `verifyAccessToken`: assinatura, kid, token_version), só muda a FONTE
 * do token (cookie em vez de header). Popula `request.user` (com `exp`, que o
 * handler do stream usa pro timer de token_expired).
 *
 * LIMITE DE REVOGAÇÃO (documentado em docs/07): valida no handshake e o handler
 * fecha o stream no `exp`. Revogação de sessão no MEIO de um stream aberto não
 * derruba a conexão na hora — o token segue criptograficamente válido até o
 * exp, então a latência de revogação fica limitada ao TTL do access token
 * (~15min). Aceitável no MVP; derrubada imediata via pub/sub é possibilidade
 * futura, não construída agora.
 */
@Injectable()
export class StreamCookieAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readStreamCookie(request);
    if (!token) throw new UnauthorizedException('Cookie de stream ausente.');

    try {
      request.user = await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () => this.tokenService.verifyAccessToken(token),
      );
    } catch (error) {
      if (error instanceof ExpiredTokenError || error instanceof RevokedTokenError || error instanceof InvalidTokenError) {
        throw new UnauthorizedException('Cookie de stream inválido.');
      }
      throw error;
    }

    return true;
  }
}
