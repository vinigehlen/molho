import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_SUSPENDED_KEY = 'allow_while_suspended';

/**
 * Épico 13d — marca uma rota como acessível MESMO com a assinatura
 * `suspended`/`canceled`. `TenantContextInterceptor` lê este metadata e
 * pula o bloqueio de assinatura só pra essa rota (RLS e resolução de tenant
 * continuam normais). Opt-in por rota, de propósito — fail-closed por
 * padrão (toda rota nova bloqueia sozinha; só quem precisa marca).
 *
 * Único uso legítimo hoje: o próprio painel de assinatura do lojista
 * (`SubscriptionController`) — um lojista suspenso precisa CONSEGUIR ver
 * por que está suspenso e cancelar, não fica trancado fora do próprio
 * backoffice sem explicação nenhuma.
 */
export const AllowWhileSuspended = (): ClassDecorator & MethodDecorator =>
  SetMetadata(ALLOW_WHILE_SUSPENDED_KEY, true);
