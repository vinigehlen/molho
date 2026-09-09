import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { RequestContextService } from '../context/request-context.service';
import { CreatePrintDeviceDto } from './dto/create-print-device.dto';
import { PRINT_DEVICE_SERVICE } from './print-device.tokens';
import {
  PrintDeviceNameConflictError,
  PrintDeviceNotFoundError,
  type PrintDeviceActor,
  type PrintDeviceService,
} from './print-device.service';

/**
 * Gestão de dispositivos de impressão pelo STAFF (parear / listar / rotacionar /
 * revogar). `team.manage` (decisão PM da ata NG-01: sem permissão nova).
 * `create` e `rotate` devolvem o segredo em claro UMA vez — o front mostra e
 * descarta.
 */
@Controller('v1/admin/printing/devices')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('printing.escpos')
@RequirePermission('team.manage')
export class PrintDeviceAdminController {
  constructor(
    @Inject(PRINT_DEVICE_SERVICE) private readonly devices: PrintDeviceService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  list() {
    return this.devices.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async pair(@Body() dto: CreatePrintDeviceDto, @Req() req: RequestWithUser) {
    try {
      return await this.devices.pair(dto.name, this.actor(req));
    } catch (error) {
      if (error instanceof PrintDeviceNameConflictError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  async rotate(@Param('id') id: string, @Req() req: RequestWithUser) {
    try {
      return await this.devices.rotate(id, this.actor(req));
    } catch (error) {
      if (error instanceof PrintDeviceNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string, @Req() req: RequestWithUser): Promise<void> {
    try {
      await this.devices.revoke(id, this.actor(req));
    } catch (error) {
      if (error instanceof PrintDeviceNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Papel que vira `actor_role` no audit — mesma cobertura tenant/plataforma dos outros controllers. */
  private actor(req: RequestWithUser): PrintDeviceActor {
    const tenantId = this.requestContext.getTenantId();
    const scope = req.user.scopes.find(
      (s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId),
    );
    if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
    return { userId: req.user.sub, role: scope.role };
  }
}
