import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@molho/db';
import { PRISMA_CLIENT } from './prisma.token';

export interface TenantContext {
  tenantId: string;
  isPlatform: boolean;
}

interface Store extends TenantContext {
  client: Prisma.TransactionClient;
}

/**
 * `SET LOCAL app.tenant_id`/`app.is_platform` só vale dentro de UMA
 * transação/conexão — com pool (`@prisma/adapter-pg`), duas queries do
 * mesmo request HTTP podem pegar conexões físicas diferentes, então setar o
 * GUC uma vez só no início do request não propaga pras queries seguintes.
 *
 * A solução é abrir UMA transação por request (fixa uma única conexão do
 * pool pra toda a duração dela), rodar `SET LOCAL` como primeira coisa
 * dentro dela, e guardar o client transacional aqui via `AsyncLocalStorage`
 * — todo código do resto do request pega esse client via `getClient()`,
 * nunca o `PrismaClient` global injetado direto (é lint error fazer isso em
 * `apps/api/src/**`, ver `eslint.config.mjs` e CLAUDE.md § Contexto de
 * request). `AsyncLocalStorage` garante que chamadas concorrentes de
 * requests diferentes nunca vejam o contexto uma da outra — cada `run()`
 * cria seu próprio "compartimento", propagado automaticamente por toda a
 * cadeia de `await` daquele request, sem precisar passar o contexto como
 * parâmetro em cada função.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<Store>();

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Abre a transação do request, seta os GUCs de RLS e roda `fn` dentro do
   * contexto. Se `fn` lançar, a transação inteira é revertida pelo Prisma
   * (comportamento padrão de `$transaction` com callback) — nenhuma escrita
   * feita antes do erro sobrevive.
   */
  async run<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.is_platform', ${String(context.isPlatform)}, true)`;

      return this.als.run({ ...context, client: tx }, fn);
    });
  }

  /** O client transacional do request atual — nunca o PrismaClient global. */
  getClient(): Prisma.TransactionClient {
    return this.requireStore().client;
  }

  /**
   * True se há uma transação de request ativa (dentro de um `run()`). Usado pra
   * ASSERTAR que código que NÃO pode rodar dentro da transação (ex.: publish de
   * evento no OrderPublishInterceptor, que precisa ser pós-commit) de fato está
   * fora dela — transforma erro de ordem de interceptor em falha barulhenta na
   * hora, não corrida silenciosa.
   */
  hasActiveContext(): boolean {
    return this.als.getStore() !== undefined;
  }

  getTenantId(): string {
    return this.requireStore().tenantId;
  }

  isPlatform(): boolean {
    return this.requireStore().isPlatform;
  }

  private requireStore(): Store {
    const store = this.als.getStore();
    if (!store) {
      throw new Error(
        'RequestContextService usado fora de um contexto de request — todo acesso precisa passar por run() primeiro (o guard/interceptor de tenant faz isso antes de qualquer handler).',
      );
    }
    return store;
  }
}
