import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { StaffProvisioningController } from './staff-provisioning.controller';
import { StaffProvisioningRepository } from './staff-provisioning.repository';
import { StaffProvisioningService } from './staff-provisioning.service';
import { STAFF_PROVISIONING_REPOSITORY, STAFF_PROVISIONING_SERVICE } from './staff-provisioning.tokens';

@Module({
  imports: [AuthModule, ContextModule, TokenModule],
  controllers: [StaffProvisioningController],
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
  ],
})
export class PlatformModule {}
