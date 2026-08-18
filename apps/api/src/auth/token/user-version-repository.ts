import type { RequestContextService } from '../../context/request-context.service';
import { InvalidTokenError } from './token-errors';
import type { TokenScope } from './token-payload';

/**
 * Fonte da verdade de token_version e das atribuições de papel — Postgres,
 * sempre via RequestContextService (nunca PrismaClient direto, ver
 * CLAUDE.md § Contexto de request).
 *
 * `getRoleAssignments` existe porque rotateTokens() precisa reemitir o
 * access token com roles/scopes atuais — reaproveitar o que foi salvo na
 * sessão no login original deixaria RBAC obsoleto por até 30 dias (o TTL
 * deslizante do refresh) se o papel do usuário mudasse no meio do caminho.
 */
export interface UserAuthRepository {
  getTokenVersion(userId: string): Promise<number>;
  incrementTokenVersion(userId: string): Promise<number>;
  getRoleAssignments(userId: string): Promise<TokenScope[]>;
}

export class PrismaUserAuthRepository implements UserAuthRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  /**
   * `findUnique`, NUNCA `findUniqueOrThrow` — `userId` vem do `sub` de um JWT
   * já com assinatura válida, mas `verifyAccessToken` NÃO garante que o
   * `sub` seja um staff: token de CUSTOMER usa o MESMO `MOLHO_JWT_SECRETS`
   * (TokenService é agnóstico a quem assina, ver customer-auth-repository.ts),
   * então um token de cliente contra uma rota staff-only chega aqui com um
   * `customerId` que não existe em `users`. `findUniqueOrThrow` deixava esse
   * caso vazar como `PrismaClientKnownRequestError` (P2025) cru — sem catch
   * em `JwtAuthGuard` pra esse tipo, virava 500. `InvalidTokenError` é o
   * mesmo erro que um `kid` desconhecido ou assinatura inválida já produzem
   * — `JwtAuthGuard` já trata (401), então throw aqui basta, sem precisar
   * mudar o guard nem `TokenService.verifyAccessToken` (nenhum try/catch
   * envolve esta chamada lá, o erro sobe direto).
   */
  async getTokenVersion(userId: string): Promise<number> {
    const user = await this.requestContext.getClient().user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
    if (!user) throw new InvalidTokenError('usuário do token não encontrado');
    return user.tokenVersion;
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.requestContext.getClient().user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return user.tokenVersion;
  }

  async getRoleAssignments(userId: string): Promise<TokenScope[]> {
    const roles = await this.requestContext.getClient().userRole.findMany({
      where: { userId },
      select: { role: true, scopeType: true, scopeId: true },
    });
    return roles;
  }
}
