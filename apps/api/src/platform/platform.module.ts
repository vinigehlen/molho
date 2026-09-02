import { Module } from '@nestjs/common';
import type { ModuleCache } from '@molho/db';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { MODULE_CACHE, ModuleCheckModule } from '../modules/module-check.module';
import { ModulePanelController } from './module-panel.controller';
import { ModulePanelRepository } from './module-panel.repository';
import { ModulePanelService } from './module-panel.service';
import { MODULE_PANEL_REPOSITORY, MODULE_PANEL_SERVICE } from './module-panel.tokens';
import { PlatformTenantsController } from './platform-tenants.controller';
import { StaffProvisioningController } from './staff-provisioning.controller';
import { StaffProvisioningRepository } from './staff-provisioning.repository';
import { StaffProvisioningService } from './staff-provisioning.service';
import { STAFF_PROVISIONING_REPOSITORY, STAFF_PROVISIONING_SERVICE } from './staff-provisioning.tokens';

@Module({
  imports: [AuthModule, ContextModule, TokenModule, ModuleCheckModule],
  controllers: [StaffProvisioningController, ModulePanelController, PlatformTenantsController],
  providers: [
    {
      provide: STAFF_PROVISIONING_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new StaffProvisioningRepository(requestContext),
    },
    {
      provide: STAFF_PROVISIONING_SERVICE,
      inject: [STAFF_PROVISIONING_REPOSITORY],
      useFactory: (repo: StaffProvisioningRepository) => new StaffProvisioningService(repo),
    },
    {
      provide: MODULE_PANEL_REPOSITORY,
      inject: [RequestContextService, MODULE_CACHE],
      useFactory: (requestContext: RequestContextService, cache: ModuleCache) =>
        new ModulePanelRepository(requestContext, cache),
    },
    {
      provide: MODULE_PANEL_SERVICE,
      inject: [MODULE_PANEL_REPOSITORY],
      useFactory: (repo: ModulePanelRepository) => new ModulePanelService(repo),
    },
  ],
})
export class PlatformModule {}
