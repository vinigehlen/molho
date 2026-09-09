import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { ClaimPrintJobDto } from './dto/claim-print-job.dto';
import { FailPrintJobDto, FinishPrintJobDto } from './dto/finish-print-job.dto';
import { PrintDeviceAuthGuard } from './print-device-auth.guard';
import { PrintDeviceContextInterceptor } from './print-device-context.interceptor';
import { PRINTING_SERVICE } from './printing.tokens';
import { PrintJobConflictError, type PrintingService } from './printing.service';

/**
 * Rotas do AGENTE de impressão (NG-06). Namespace próprio, FORA de
 * `/v1/admin/*`: autentica por credencial de dispositivo (`PrintDeviceAuthGuard`),
 * não por sessão de staff. `@RequireModule('printing.escpos')` continua valendo
 * (entitled AND enabled AND released). Mesma semântica de claim/lease/optimistic
 * lock de `PrintingController` — só muda o ator.
 */
@Controller('v1/printing/agent')
@UseGuards(PrintDeviceAuthGuard, RequireModuleGuard)
@UseInterceptors(PrintDeviceContextInterceptor)
@RequireModule('printing.escpos')
export class PrintingAgentController {
  constructor(@Inject(PRINTING_SERVICE) private readonly printing: PrintingService) {}

  @Post('jobs/claim')
  @HttpCode(HttpStatus.OK)
  async claim(@Body() dto: ClaimPrintJobDto) {
    // `{}` explícito quando não há job — Nest serializaria `null` como corpo
    // VAZIO, e `fetch().json()` no agente lança nesse caso. Ver api.ts.
    return (await this.printing.claimNext(dto)) ?? {};
  }

  @Post('jobs/:id/printed')
  @HttpCode(HttpStatus.NO_CONTENT)
  async printed(@Param('id') id: string, @Body() dto: FinishPrintJobDto): Promise<void> {
    await this.finish(() => this.printing.markPrinted({ id, expectedVersion: dto.version, workerId: dto.workerId }));
  }

  @Post('jobs/:id/failed')
  @HttpCode(HttpStatus.NO_CONTENT)
  async failed(@Param('id') id: string, @Body() dto: FailPrintJobDto): Promise<void> {
    await this.finish(() =>
      this.printing.markFailed({ id, expectedVersion: dto.version, workerId: dto.workerId, error: dto.error }),
    );
  }

  private async finish(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof PrintJobConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
