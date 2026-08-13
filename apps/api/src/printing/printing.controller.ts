import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { ClaimPrintJobDto } from './dto/claim-print-job.dto';
import { CreatePrintJobDto } from './dto/create-print-job.dto';
import { FailPrintJobDto, FinishPrintJobDto } from './dto/finish-print-job.dto';
import { PRINTING_SERVICE } from './printing.tokens';
import { PrintJobConflictError, PrintOrderNotFoundError, type PrintingService } from './printing.service';

@Controller('v1/admin/printing')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('printing.escpos')
@RequirePermission('order.view')
export class PrintingController {
  constructor(@Inject(PRINTING_SERVICE) private readonly printing: PrintingService) {}

  @Get('status')
  status() {
    return this.printing.status();
  }

  @Post('orders/:orderId/jobs')
  @HttpCode(HttpStatus.CREATED)
  async createForOrder(@Param('orderId') orderId: string, @Body() dto: CreatePrintJobDto) {
    try {
      return await this.printing.queueOrderTicket({
        orderId,
        idempotencyKey: dto.idempotencyKey,
        width: dto.width,
        cut: dto.cut,
      });
    } catch (error) {
      if (error instanceof PrintOrderNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('jobs/claim')
  @HttpCode(HttpStatus.OK)
  claim(@Body() dto: ClaimPrintJobDto) {
    return this.printing.claimNext(dto);
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
