import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from './guards/jwt-auth.guard';
import { TOKEN_SERVICE } from './token/token.module';
import type { TokenService } from './token/token.service';

/**
 * "Meus dispositivos" — sempre do STAFF autenticado (JwtAuthGuard usa
 * TOKEN_SERVICE, não CUSTOMER_TOKEN_SERVICE). Sessões são globais ao user,
 * não presas a um tenant, então cada handler roda dentro de
 * RequestContextService.run() com o contexto de plataforma (mesmo padrão de
 * staff-auth.controller.ts) — necessário porque revokeAllSessions sobe
 * token_version via getClient(), que lança fora de um run() ativo (achado
 * revisando este controller antes do commit: nada abria contexto aqui).
 * Rotas 'all'/'others' vêm ANTES de ':deviceId' de propósito: senão o Nest
 * casa 'all'/'others' como valor de :deviceId.
 */
@Controller('v1/me/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  private runAsPlatform<T>(fn: () => Promise<T>): Promise<T> {
    return this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, fn);
  }

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.runAsPlatform(async () => {
      const sessions = await this.tokenService.listSessions(req.user.sub);
      return {
        devices: sessions.map((session) => ({
          deviceId: session.deviceId,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          ipAtLastUse: session.ipAtLastUse,
          isCurrent: session.deviceId === req.user.deviceId,
        })),
      };
    });
  }

  /**
   * Contextos selecionáveis no backoffice. Os IDs vêm do JWT já verificado e
   * entram explicitamente no WHERE: user_roles não tem RLS e nunca é lida em
   * massa. Escopo de tenant enxerga todas as lojas dele; escopo de store só a
   * loja atribuída.
   */
  @Get('tenants')
  async tenants(@Req() req: RequestWithUser) {
    return this.runAsPlatform(async () => {
      const tenantScopeIds = req.user.scopes
        .filter((scope) => scope.scopeType === 'tenant' && scope.scopeId !== null)
        .map((scope) => scope.scopeId as string);
      const storeScopeIds = req.user.scopes
        .filter((scope) => scope.scopeType === 'store' && scope.scopeId !== null)
        .map((scope) => scope.scopeId as string);

      const stores = await this.requestContext.getClient().store.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(tenantScopeIds.length > 0 ? [{ tenantId: { in: tenantScopeIds } }] : []),
            ...(storeScopeIds.length > 0 ? [{ id: { in: storeScopeIds } }] : []),
          ],
        },
        select: { id: true, tenantId: true, name: true },
        orderBy: { name: 'asc' },
      });
      const tenantIds = [...new Set([...tenantScopeIds, ...stores.map((store) => store.tenantId)])];
      if (tenantIds.length === 0) return { tenants: [] };

      const tenants = await this.requestContext.getClient().tenant.findMany({
        where: { id: { in: tenantIds }, deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      });
      return {
        tenants: tenants.map((tenant) => ({
          ...tenant,
          stores: stores
            .filter((store) => store.tenantId === tenant.id)
            .map(({ id, name }) => ({ id, name })),
        })),
      };
    });
  }

  @Delete('all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(@Req() req: RequestWithUser): Promise<void> {
    await this.runAsPlatform(() => this.tokenService.revokeAllSessions(req.user.sub));
  }

  @Delete('others')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOthers(@Req() req: RequestWithUser): Promise<void> {
    await this.runAsPlatform(() => this.tokenService.revokeOtherSessions(req.user.sub, req.user.deviceId));
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOne(@Req() req: RequestWithUser, @Param('deviceId') deviceId: string): Promise<void> {
    await this.runAsPlatform(() => this.tokenService.revokeSession(req.user.sub, deviceId));
  }
}
