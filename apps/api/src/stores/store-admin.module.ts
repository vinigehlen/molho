import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { StoreAdminController } from './store-admin.controller';
import { StoreAdminRepository } from './store-admin.repository';
import { StoreAdminService } from './store-admin.service';
import { STORE_ADMIN_REPOSITORY, STORE_ADMIN_SERVICE } from './store-admin.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule],
  controllers: [StoreAdminController],
  providers: [
    {
      provide: STORE_ADMIN_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new StoreAdminRepository(requestContext),
    },
    {
      provide: STORE_ADMIN_SERVICE,
      inject: [STORE_ADMIN_REPOSITORY, RequestContextService],
      useFactory: (repo: StoreAdminRepository, requestContext: RequestContextService) => new StoreAdminService(repo, requestContext),
    },
  ],
})
export class StoreAdminModule {}
