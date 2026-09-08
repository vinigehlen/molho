import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { firstValueFrom, from, type Observable } from 'rxjs';
import { PrismaSubscriptionRepository } from '../../billing/subscription.repository';
import { SubscriptionService } from '../../billing/subscription.service';
import { RequestContextService, type TenantContext } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { TenantLookupRepository } from '../tenant-lookup.repository';
import type { TokenPayload } from '../token/token-payload';
import { ALLOW_WHILE_SUSPENDED_KEY } from './allow-while-suspended.decorator';

type RequestWithAuth = Request & { user?: TokenPayload; params: Record<string, string> };

/**
 * NÃO é um Guard (CanActivate só decide permitir/negar, não consegue
 * envolver a execução do handler numa transação) — é um Interceptor, que
 * pode rodar código ANTES e DEPOIS de next.handle(). É o que sustenta
 * "resolve o tenant, valida o ator, e só então abre a transação de
 * RequestContextService.run() em volta do handler inteiro".
 *
 * Duas resoluções possíveis:
 * - Rota pública de storefront (:slug no path): resolve tenantId do slug
 *   (busca cross-tenant, roda com isPlatform=true só pra achar o tenant),
 *   sem autenticação — is_platform=false pro resto do handler.
 * - Rota autenticada de backoffice: tenantId vem do header X-Tenant-Id,
 *   validado contra os scopes do JWT (precisa ter um user_role cobrindo
 *   esse tenant, ou ser platform_*). Limitação conhecida: só cobre scope
 *   tenant/platform — scope_type='store' exigiria mapear store->tenant
 *   antes de validar (não implementado ainda, sem consumidor real hoje).
 *
 * Épico 13d: também é o ÚNICO ponto que aplica o bloqueio de assinatura
 * (`suspended`/`canceled`) — cobre backoffice E storefront de uma vez, sem
 * duplicar a checagem em cada controller. `SubscriptionService` é
 * instanciado via `new` (não DI token), mesmo padrão de `TenantLookupRepository`
 * logo abaixo: este interceptor é referenciado por CLASSE em
 * `@UseInterceptors()` em módulos espalhados pelo app inteiro, e um DI token
 * novo exigiria importar o módulo de billing em TODOS eles. `new` com
 * `RequestContextService` (já disponível em qualquer lugar que usa este
 * interceptor) resolve sem tocar em nenhum module.ts a mais.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly tenantLookup: TenantLookupRepository;
  private readonly subscription: SubscriptionService;

  constructor(
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    this.tenantLookup = new TenantLookupRepository(requestContext);
    this.subscription = new SubscriptionService(new PrismaSubscriptionRepository(requestContext));
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const tenantContext = await this.resolveTenantContext(request);

    const allowWhileSuspended = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_SUSPENDED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return from(
      this.requestContext.run(tenantContext, async () => {
        // Ator de PLATAFORMA nunca é bloqueado — senão o super-admin não
        // conseguiria entrar num tenant suspenso pra resolver a suspensão
        // (chicken-and-egg). Rota de storefront (isPlatform sempre false,
        // resolveTenantContext acima) não tem essa saída — não existe ator
        // de plataforma público.
        if (!tenantContext.isPlatform && !allowWhileSuspended && (await this.subscription.isAccessBlocked(tenantContext.tenantId))) {
          // Slug no path = storefront público — mesma mensagem de "loja não
          // encontrada" que um slug desconhecido recebe (nunca revela pra
          // quem visita que a loja EXISTIU e foi suspensa). Sem slug =
          // backoffice autenticado, sem risco de enumeração — mensagem
          // clara ajuda o lojista a entender por que está trancado fora.
          throw request.params?.slug
            ? new NotFoundException('Loja não encontrada.')
            : new ForbiddenException('Assinatura suspensa — entre em contato com o suporte Molho.');
        }
        return firstValueFrom(next.handle());
      }),
    );
  }

  private async resolveTenantContext(request: RequestWithAuth): Promise<TenantContext> {
    const slug = request.params?.slug;
    if (slug) {
      const tenant = await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () => this.tenantLookup.findBySlug(slug),
      );
      if (!tenant) throw new NotFoundException('Loja não encontrada.');
      return { tenantId: tenant.id, isPlatform: false };
    }

    if (!request.user) throw new UnauthorizedException('Autenticação necessária.');

    const tenantId = request.headers['x-tenant-id'];
    if (!tenantId || Array.isArray(tenantId)) {
      throw new ForbiddenException('Header X-Tenant-Id obrigatório.');
    }

    const actor = {
      id: request.user.sub,
      assignments: request.user.scopes.map((s) => ({
        role: s.role,
        scopeType: s.scopeType,
        scopeId: s.scopeId,
      })),
    };
    const isPlatformActor = actor.assignments.some((a) => a.scopeType === 'platform');
    const coversThisTenant = actor.assignments.some(
      (a) => a.scopeType === 'platform' || (a.scopeType === 'tenant' && a.scopeId === tenantId),
    );
    if (!coversThisTenant) throw new ForbiddenException('Sem acesso a este tenant.');

    // can() em si (checagem de PERMISSÃO específica) é responsabilidade de
    // um guard futuro (@RequirePermission) — este interceptor só resolve
    // ESCOPO (o ator pode agir NESTE tenant, ponto), que é o que
    // RequestContextService.run() precisa pra setar os GUCs de RLS.
    return { tenantId, isPlatform: isPlatformActor };
  }
}
