import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  type MessageEvent,
  type OnApplicationShutdown,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { type Actor, type Role, can, isRole } from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../../auth/guards/jwt-auth.guard';
import type { TokenScope } from '../../auth/token/token-payload';
import { ORDER_EVENT_BUS } from '../orders.tokens';
import type { OrderEvent, OrderEventBus } from './order-event-bus';
import { STREAM_COOKIE_NAME, StreamCookieAuthGuard } from './stream-cookie-auth.guard';

const PING_INTERVAL_MS = 25_000;
const BEARER_PREFIX = 'Bearer ';

/** Reconstrói o Actor do JWT (mesmo critério do RequirePermissionGuard) — filtra papel desconhecido em vez de castar (fail-closed). */
function actorFromRequest(req: RequestWithUser): Actor {
  return {
    id: req.user.sub,
    assignments: req.user.scopes
      .filter((s): s is TokenScope & { role: Role } => isRole(s.role))
      .map((s) => ({ role: s.role, scopeType: s.scopeType, scopeId: s.scopeId })),
  };
}

/**
 * Stream realtime do gestor de pedidos (Épico 9). Duas semânticas de auth
 * DIFERENTES neste mesmo controller, de propósito:
 *
 * - `arm`/`disarm`: rotas normais de staff, JWT no header (JwtAuthGuard).
 *   `arm` grava o cookie `__Host-molho_stream` que o `EventSource` vai enviar;
 *   `disarm` o apaga (logout).
 * - `stream`: `@Sse`, autenticado pelo COOKIE (StreamCookieAuthGuard) — porque
 *   `EventSource` não manda header nenhum.
 *
 * TENANT VEM DA QUERY, validado e congelado (decisão consciente, docs/07):
 * staff é identidade global (pode ter escopo em vários tenants) e o
 * `EventSource` não manda `X-Tenant-Id`, então o tenant desejado só chega pela
 * URL. NÃO é "cliente escolhe tenant": ele PROPÕE via query, o servidor VALIDA
 * com `can(user, 'order.view', {tenantId})` e CONGELA o validado no closure da
 * conexão. Escopo ausente/inválido = 403 ANTES de abrir o stream.
 */
@Controller('v1/admin/orders/stream')
export class OrderStreamController implements OnApplicationShutdown {
  /** Fecha-limpo de cada stream aberto (controller é singleton — sobrevive entre requests). */
  private readonly openStreams = new Set<() => void>();

  constructor(@Inject(ORDER_EVENT_BUS) private readonly bus: OrderEventBus) {}

  /**
   * SIGTERM (rolling deploy da Fly): a plataforma manda SIGTERM e ESPERA. Sem
   * isto, os streams ficam pendurados até o timeout de TCP e os clientes
   * demoram a migrar pra máquina que sobrou — a janela que as duas máquinas
   * existiam pra eliminar. Fecha cada Observable ativo com um evento
   * `server_shutdown` (o cliente reconecta na hora, na outra máquina) e
   * completa. Depende de `enableShutdownHooks()` no main.ts.
   */
  onApplicationShutdown(): void {
    for (const close of this.openStreams) close();
    this.openStreams.clear();
  }

  /**
   * Grava o cookie de stream = o próprio access token (mesmo token, validado
   * pelo mesmo verifyAccessToken). O front chama isto antes de abrir o
   * EventSource e de novo após cada refresh. Cookie __Host- + HttpOnly (XSS de
   * storefront não lê) + Secure + SameSite=Strict + sem Domain (host-only).
   * Max-Age alinhado ao exp do token: o cookie morre junto com o token.
   */
  @Post('arm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  arm(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response): void {
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) throw new UnauthorizedException('Token ausente.');
    const token = header.slice(BEARER_PREFIX.length);
    const maxAgeMs = Math.max(0, req.user.exp * 1000 - Date.now());
    res.cookie(STREAM_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  @Post('disarm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  disarm(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(STREAM_COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  }

  @Sse()
  @UseGuards(StreamCookieAuthGuard)
  stream(@Query('tenant') tenantId: string | undefined, @Req() req: RequestWithUser): Observable<MessageEvent> {
    // Valida e CONGELA o tenant proposto na query contra os scopes do usuário —
    // antes de abrir o stream, pra 403 ser erro HTTP limpo, não um stream que
    // abre e fecha.
    if (!tenantId) throw new ForbiddenException('Parâmetro tenant obrigatório.');
    if (!can(actorFromRequest(req), 'order.view', { tenantId }).allowed) {
      throw new ForbiddenException('Sem permissão de leitura de pedidos neste tenant.');
    }
    const frozenTenantId = tenantId;

    return new Observable<MessageEvent>((subscriber) => {
      // Keepalive: evento nomeado a cada 25s. Proxy/LB matam SSE ocioso; o
      // cliente ignora o tipo `ping`. (Comentário `:ping` puro não é
      // expressável via MessageEvent do Nest — evento nomeado tem o mesmo
      // efeito de manter o socket vivo.)
      const ping = setInterval(() => subscriber.next({ type: 'ping', data: '' }), PING_INTERVAL_MS);

      // Fecha o stream no exp do token (revogação com dente até o TTL, ver guard).
      const msUntilExp = Math.max(0, req.user.exp * 1000 - Date.now());
      const expTimer = setTimeout(() => {
        subscriber.next({ type: 'token_expired', data: '' });
        subscriber.complete();
      }, msUntilExp);

      // Cutuque magro — o cliente faz GET REST que bate na RLS. id = version,
      // pro Last-Event-ID (protocolo; sem replay — gap coberto por diff de ids).
      const off = this.bus.subscribe(frozenTenantId, (event: OrderEvent) => {
        subscriber.next({
          type: event.event === 'new' ? 'order_new' : 'order_status',
          data: JSON.stringify(event),
          id: String(event.version),
        });
      });

      // Fecha-limpo no SIGTERM (ver onApplicationShutdown).
      const closeForShutdown = () => {
        subscriber.next({ type: 'server_shutdown', data: '' });
        subscriber.complete();
      };
      this.openStreams.add(closeForShutdown);

      return () => {
        clearInterval(ping);
        clearTimeout(expTimer);
        off();
        this.openStreams.delete(closeForShutdown);
      };
    });
  }
}
