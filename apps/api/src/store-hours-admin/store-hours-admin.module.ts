import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { PrismaStoreHoursAdminRepository } from './store-hours-admin.repository';
import { StoreHoursAdminController } from './store-hours-admin.controller';
import { StoreHoursAdminService } from './store-hours-admin.service';
import { STORE_HOURS_ADMIN_REPOSITORY, STORE_HOURS_ADMIN_SERVICE } from './store-hours-admin.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [StoreHoursAdminController],
  providers: [
    {
      provide: STORE_HOURS_ADMIN_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaStoreHoursAdminRepository(requestContext),
    },
    {
      provide: STORE_HOURS_ADMIN_SERVICE,
      inject: [STORE_HOURS_ADMIN_REPOSITORY],
      useFactory: (repo: PrismaStoreHoursAdminRepository) => new StoreHoursAdminService(repo),
    },
  ],
})
export class StoreHoursAdminModule {}
