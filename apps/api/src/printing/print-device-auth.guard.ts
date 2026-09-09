import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { PRINT_DEVICE_SERVICE } from './print-device.tokens';
import type { PrintDeviceService } from './print-device.service';
import type { RequestWithPrintDevice } from './print-device-request';

const BEARER_PREFIX = 'Bearer ';

/**
 * Auth do AGENTE de impressão — credencial de DISPOSITIVO (`molho_pd_...`), não
 * token de staff. Não herda `JwtAuthGuard`: o agente não tem sessão, não
 * expira, não carrega papel. Ver NG-06.
 *
 * Abre um contexto de PLATAFORMA só pra achar o dispositivo pelo prefixo
 * (mesmo padrão de `JwtAuthGuard`, que roda antes de qualquer interceptor).
 * `PrintDeviceContextInterceptor` abre depois a transação real, já escopada ao
 * tenant do dispositivo.
 *
 * Erro uniforme (401 "inválida ou revogada") pra não distinguir segredo errado
 * de dispositivo revogado de tenant trocado.
 */
@Injectable()
export class PrintDeviceAuthGuard implements CanActivate {
  constructor(
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    @Inject(PRINT_DEVICE_SERVICE) private readonly devices: PrintDeviceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrintDevice>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Credencial de impressão ausente.');
    }
    const secret = header.slice(BEARER_PREFIX.length);

    const device = await this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      () => this.devices.authenticate(secret),
    );
    if (!device) {
      throw new UnauthorizedException('Credencial de impressão inválida ou revogada.');
    }

    // Se o agente mandou x-tenant-id, tem que bater com o dono do dispositivo.
    const headerTenant = request.headers['x-tenant-id'];
    if (typeof headerTenant === 'string' && headerTenant.length > 0 && headerTenant !== device.tenantId) {
      throw new UnauthorizedException('Credencial de impressão inválida ou revogada.');
    }

    request.printDevice = device;
    // RequireModuleGuard roda DEPOIS deste e lê o tenant do header — normaliza.
    request.headers['x-tenant-id'] = device.tenantId;
    return true;
  }
}
