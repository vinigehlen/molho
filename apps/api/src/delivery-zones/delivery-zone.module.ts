import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { DeliveryZoneAdminController } from './delivery-zone.controller';
import { PrismaDeliveryZoneRepository } from './delivery-zone.repository';
import { DeliveryZoneAdminService } from './delivery-zone.service';
import { DELIVERY_ZONE_ADMIN_REPOSITORY, DELIVERY_ZONE_ADMIN_SERVICE } from './delivery-zone.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [DeliveryZoneAdminController],
  providers: [
    {
      provide: DELIVERY_ZONE_ADMIN_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaDeliveryZoneRepository(requestContext),
    },
    {
      provide: DELIVERY_ZONE_ADMIN_SERVICE,
      inject: [DELIVERY_ZONE_ADMIN_REPOSITORY],
      useFactory: (repo: PrismaDeliveryZoneRepository) => new DeliveryZoneAdminService(repo),
    },
  ],
})
export class DeliveryZoneAdminModule {}
