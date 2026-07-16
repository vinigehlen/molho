import type { RequestContextService } from '../../context/request-context.service';
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

  async getTokenVersion(userId: string): Promise<number> {
    const user = await this.requestContext
      .getClient()
      .user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
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
