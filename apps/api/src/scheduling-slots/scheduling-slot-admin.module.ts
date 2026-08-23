import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { PrismaSchedulingSlotAdminRepository } from './scheduling-slot-admin.repository';
import { SchedulingSlotAdminController } from './scheduling-slot-admin.controller';
import { SchedulingSlotAdminService } from './scheduling-slot-admin.service';
import { SCHEDULING_SLOT_ADMIN_REPOSITORY, SCHEDULING_SLOT_ADMIN_SERVICE } from './scheduling-slot-admin.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [SchedulingSlotAdminController],
  providers: [
    {
      provide: SCHEDULING_SLOT_ADMIN_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaSchedulingSlotAdminRepository(requestContext),
    },
    {
      provide: SCHEDULING_SLOT_ADMIN_SERVICE,
      inject: [SCHEDULING_SLOT_ADMIN_REPOSITORY],
      useFactory: (repo: PrismaSchedulingSlotAdminRepository) => new SchedulingSlotAdminService(repo),
    },
  ],
})
export class SchedulingSlotAdminModule {}
