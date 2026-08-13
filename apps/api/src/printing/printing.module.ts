import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule, MODULE_CACHE } from '../modules/module-check.module';
import { PrintingController } from './printing.controller';
import { PrismaPrintJobRepository } from './print-job.repository';
import { PrintingService } from './printing.service';
import { PRINTING_SERVICE, PRINT_JOB_REPOSITORY } from './printing.tokens';
import type { ModuleCache } from '@molho/db';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [PrintingController],
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
  ],
  exports: [PRINTING_SERVICE],
})
export class PrintingModule {}

