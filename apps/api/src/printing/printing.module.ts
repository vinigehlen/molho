import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule, MODULE_CACHE } from '../modules/module-check.module';
import { PrintingController } from './printing.controller';
import { PrintDeviceAdminController } from './print-device-admin.controller';
import { PrintingAgentController } from './printing-agent.controller';
import { PrismaPrintJobRepository } from './print-job.repository';
import { PrismaPrintDeviceRepository, type PrintDeviceRepository } from './print-device.repository';
import { PrintDeviceAuthGuard } from './print-device-auth.guard';
import { PrintDeviceContextInterceptor } from './print-device-context.interceptor';
import { PrintDeviceService } from './print-device.service';
import { PrintingService } from './printing.service';
import { PRINT_DEVICE_REPOSITORY, PRINT_DEVICE_SERVICE } from './print-device.tokens';
import { PRINTING_SERVICE, PRINT_JOB_REPOSITORY } from './printing.tokens';
import type { ModuleCache } from '@molho/db';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [PrintingController, PrintDeviceAdminController, PrintingAgentController],
  providers: [
    {
      provide: PRINT_JOB_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaPrintJobRepository(requestContext),
    },
    {
      provide: PRINTING_SERVICE,
      inject: [PRINT_JOB_REPOSITORY, RequestContextService, MODULE_CACHE],
      useFactory: (
        repo: PrismaPrintJobRepository,
        requestContext: RequestContextService,
        moduleCache: ModuleCache,
      ): PrintingService => new PrintingService(repo, requestContext, moduleCache),
    },
    {
      provide: PRINT_DEVICE_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaPrintDeviceRepository(requestContext),
    },
    {
      provide: PRINT_DEVICE_SERVICE,
      inject: [PRINT_DEVICE_REPOSITORY],
      useFactory: (repo: PrintDeviceRepository): PrintDeviceService => new PrintDeviceService(repo),
    },
    PrintDeviceAuthGuard,
    PrintDeviceContextInterceptor,
  ],
  exports: [PRINTING_SERVICE],
})
export class PrintingModule {}
