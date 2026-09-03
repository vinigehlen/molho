import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaStoreSetupRepository } from './store-setup.repository';
import { StoreSetupController } from './store-setup.controller';
import { StoreSetupService } from './store-setup.service';
import { STORE_SETUP_REPOSITORY, STORE_SETUP_SERVICE } from './store-setup.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule, StorageModule],
  controllers: [StoreSetupController],
  providers: [
    {
      provide: STORE_SETUP_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaStoreSetupRepository(requestContext),
    },
    {
      provide: STORE_SETUP_SERVICE,
      inject: [STORE_SETUP_REPOSITORY],
      useFactory: (repo: PrismaStoreSetupRepository) => new StoreSetupService(repo),
    },
  ],
})
export class StoreSetupModule {}
