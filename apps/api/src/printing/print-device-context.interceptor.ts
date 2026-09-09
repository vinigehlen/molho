import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom, from, type Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
import type { RequestWithPrintDevice } from './print-device-request';

/**
 * Abre a transação de request escopada ao tenant do dispositivo (autenticado
 * pelo `PrintDeviceAuthGuard`). Equivalente ao `TenantContextInterceptor`, mas
 * para o ator "dispositivo" — sem `request.user`, sem validação de scope de
 * staff, sem checagem de assinatura suspensa (a cozinha imprime mesmo com a
 * loja em grace/suspensão administrativa; o storefront é que fecha).
 */
@Injectable()
export class PrintDeviceContextInterceptor implements NestInterceptor {
  constructor(@Inject(RequestContextService) private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithPrintDevice>();
    const device = request.printDevice;
    if (!device) {
      throw new UnauthorizedException('Contexto de dispositivo ausente.');
    }
    return from(
      this.requestContext.run({ tenantId: device.tenantId, isPlatform: false }, () => firstValueFrom(next.handle())),
    );
  }
}
