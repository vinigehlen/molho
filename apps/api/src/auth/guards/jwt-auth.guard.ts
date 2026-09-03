import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { TOKEN_SERVICE } from '../token/token.module';
import type { TokenService } from '../token/token.service';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../token/token-errors';
import type { TokenPayload } from '../token/token-payload';

export type RequestWithUser = Request & { user: TokenPayload };

const BEARER_PREFIX = 'Bearer ';

/**
 * Valida o access token de STAFF (TOKEN_SERVICE — users.token_version) e
 * popula request.user com o payload. Erros de domínio (expirado/revogado/
 * inválido) viram 401 uniforme — não vaza QUAL dos três foi, pra não dar
 * dica a quem está tentando token roubado/forjado.
 *
 * `InvalidTokenError` também cobre token de CUSTOMER numa rota staff-only:
 * a assinatura verifica (staff e customer compartilham `MOLHO_JWT_SECRETS`),
 * mas `PrismaUserAuthRepository.getTokenVersion` (chamada dentro de
 * `verifyAccessToken`, ver user-version-repository.ts) não acha o `sub`
 * (um customerId) em `users` e lança `InvalidTokenError` — cai no mesmo
 * `catch` abaixo, 401, nunca 500 cru de Prisma.
 *
 * verifyAccessToken às vezes precisa ler users.token_version do Postgres
 * (cache de 60s expirado) — Guards rodam ANTES de qualquer Interceptor
 * (TenantContextInterceptor incluso), então não dá pra contar com um
 * contexto já aberto. Abre o seu próprio contexto de plataforma, só pra essa
 * leitura pontual (mesmo padrão de resolveTenantId em staff/customer-auth
 * controller) — a transação do handler em si é outra, aberta depois.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
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

    // Impersonation somente-leitura por padrão (docs/01 §5-C.1) — reforçado
    // AQUI, num único ponto global, em vez de em cada controller: qualquer
    // rota nova herda a trava de graça. GET/HEAD/OPTIONS passam; qualquer
    // outro verbo com `readOnly: true` no token é 403, mesmo que o
    // `@RequirePermission` da rota deixasse passar.
    const impersonation = request.user.impersonation;
    if (impersonation?.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      throw new ForbiddenException('Sessão de impersonation é somente-leitura.');
    }

    return true;
  }
}
