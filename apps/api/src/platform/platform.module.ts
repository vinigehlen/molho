import { Logger, Module } from '@nestjs/common';
import type { ModuleCache } from '@molho/db';
import { AuthModule } from '../auth/auth.module';
import { TOKEN_SERVICE, TokenModule } from '../auth/token/token.module';
import type { TokenService } from '../auth/token/token.service';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { EMAIL_PROVIDER, MessagingModule } from '../messaging/messaging.module';
import type { EmailProvider } from '../messaging/email-provider.port';
import { MODULE_CACHE, ModuleCheckModule } from '../modules/module-check.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationRepository } from './impersonation.repository';
import { ImpersonationService } from './impersonation.service';
import { IMPERSONATION_REPOSITORY, IMPERSONATION_SERVICE } from './impersonation.tokens';
import { ModulePanelController } from './module-panel.controller';
import { ModulePanelRepository } from './module-panel.repository';
import { ModulePanelService } from './module-panel.service';
import { MODULE_PANEL_REPOSITORY, MODULE_PANEL_SERVICE } from './module-panel.tokens';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PLATFORM_PROVISIONING_SERVICE } from './platform-provisioning.tokens';
import { PlatformTenantsController } from './platform-tenants.controller';
import { StaffProvisioningController } from './staff-provisioning.controller';
import { StaffProvisioningRepository } from './staff-provisioning.repository';
import { StaffProvisioningService } from './staff-provisioning.service';
import { STAFF_PROVISIONING_REPOSITORY, STAFF_PROVISIONING_SERVICE } from './staff-provisioning.tokens';

@Module({
  imports: [AuthModule, ContextModule, TokenModule, ModuleCheckModule, MessagingModule],
  controllers: [
    StaffProvisioningController,
    ModulePanelController,
    PlatformTenantsController,
    ImpersonationController,
  ],
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
    {
      provide: PLATFORM_PROVISIONING_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PlatformProvisioningService(requestContext),
    },
    {
      provide: IMPERSONATION_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new ImpersonationRepository(requestContext),
    },
    {
      provide: IMPERSONATION_SERVICE,
      inject: [IMPERSONATION_REPOSITORY, TOKEN_SERVICE, EMAIL_PROVIDER],
      useFactory: (repo: ImpersonationRepository, tokenService: TokenService, emailProvider: EmailProvider) =>
        new ImpersonationService(repo, tokenService, emailProvider, new Logger('ImpersonationService')),
    },
  ],
})
export class PlatformModule {}
