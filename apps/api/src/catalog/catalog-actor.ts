import { ForbiddenException } from '@nestjs/common';
import type { RequestWithUser } from '../auth/guards/jwt-auth.guard';

export interface CatalogActor {
  userId: string;
  role: string;
  ip: string | null;
}

/** O guard já provou a permissão; aqui escolhemos qual atribuição vira
 * actor_role no audit_log, seguindo a mesma cobertura tenant/plataforma dos
 * controllers de pedido. */
export function resolveCatalogActor(req: RequestWithUser, tenantId: string): CatalogActor {
  const scope = req.user.scopes.find(
    (candidate) =>
      candidate.scopeType === 'platform' ||
      (candidate.scopeType === 'tenant' && candidate.scopeId === tenantId),
  );
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return { userId: req.user.sub, role: scope.role, ip: req.ip ?? null };
}
