import { Module } from '@nestjs/common';
import { type PrismaClient, createPrismaClient } from '@molho/db';
import { PRISMA_CLIENT } from './prisma.token';
import { RequestContextService } from './request-context.service';

/**
 * Módulo dedicado só pra poder ser importado por quem precisa de
 * RequestContextService (TokenModule, OtpModule que toca banco no futuro,
 * etc.) sem depender do AppModule inteiro — evita import circular.
 */
@Module({
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
export class ContextModule {}
