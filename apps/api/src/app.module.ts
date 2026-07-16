import { Module } from '@nestjs/common';
import { type PrismaClient, createPrismaClient } from '@molho/db';
import { PRISMA_CLIENT } from './context/prisma.token';
import { RequestContextService } from './context/request-context.service';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [HealthController],
  providers: [
    {
      provide: PRISMA_CLIENT,
      // Client global, dono de app_runtime — nunca usado direto em request
      // path (ver RequestContextService). Único lugar fora dele que importa
      // PrismaClient, por isso é exceção do lint (eslint.config.mjs).
      useFactory: (): PrismaClient => createPrismaClient(process.env.DATABASE_URL ?? ''),
    },
    RequestContextService,
  ],
  exports: [RequestContextService],
})
export class AppModule {}
