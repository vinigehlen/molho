import type { Prisma, PrismaClient } from '@molho/db';
import { describe, expect, it } from 'vitest';
import { RequestContextService } from './request-context.service';

/**
 * Fake de PrismaClient que simula transação de verdade em memória: escritas
 * feitas dentro de `run()` só "commitam" (entram em `committed`) se o
 * callback resolver; se lançar, ficam só em `staged` e são descartadas — é
 * o mesmo contrato que `$transaction` real tem com o Postgres.
 */
function fakeTransactionalPrisma() {
  const committed: string[] = [];
  const executedSql: string[] = [];

  const prisma = {
    async $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      const staged: string[] = [];
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          executedSql.push(strings.join('?') + ' -- ' + JSON.stringify(values));
          return 0;
        },
        write: (value: string) => staged.push(value),
      } as unknown as Prisma.TransactionClient & { write: (value: string) => void };

      // Sem try/catch: se fn() lançar, o await rejeita antes de chegar no
      // push — staged nunca entra em committed. É o "rollback" deste fake.
      const result = await fn(tx);
      committed.push(...staged);
      return result;
    },
  } as unknown as PrismaClient;

  return { prisma, committed, executedSql };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('RequestContextService', () => {
  it('seta os GUCs de RLS (set_config) como primeira coisa dentro da transação', async () => {
    const { prisma, executedSql } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    await svc.run({ tenantId: 'tenant-1', isPlatform: false }, async () => 'ok');

    expect(executedSql[0]).toContain('set_config');
    expect(executedSql[0]).toContain('tenant-1');
    expect(executedSql[1]).toContain('app.is_platform');
  });

  it('getClient/getTenantId/isPlatform devolvem o contexto do request atual', async () => {
    const { prisma } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    await svc.run({ tenantId: 'tenant-1', isPlatform: true }, async () => {
      expect(svc.getTenantId()).toBe('tenant-1');
      expect(svc.isPlatform()).toBe(true);
      expect(svc.getClient()).toBeDefined();
    });
  });

  it('usado fora de run() lança, não devolve undefined silenciosamente', () => {
    const { prisma } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    expect(() => svc.getTenantId()).toThrow(/fora de um contexto de request/);
  });

  it('rollback em erro: escrita feita antes do throw não é preservada', async () => {
    const { prisma, committed } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    await expect(
      svc.run({ tenantId: 'tenant-1', isPlatform: false }, async () => {
        (svc.getClient() as unknown as { write: (v: string) => void }).write('linha-que-nao-deveria-sobreviver');
        throw new Error('falha no meio do request');
      }),
    ).rejects.toThrow('falha no meio do request');

    expect(committed).toEqual([]);
  });

  it('sem erro, a escrita É preservada (contraste com o teste de rollback)', async () => {
    const { prisma, committed } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    await svc.run({ tenantId: 'tenant-1', isPlatform: false }, async () => {
      (svc.getClient() as unknown as { write: (v: string) => void }).write('linha-ok');
    });

    expect(committed).toEqual(['linha-ok']);
  });

  it('contexto NUNCA vaza entre requests concorrentes (AsyncLocalStorage isolado por run())', async () => {
    const { prisma } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    const seenByA: string[] = [];
    const seenByB: string[] = [];

    await Promise.all([
      svc.run({ tenantId: 'tenant-A', isPlatform: false }, async () => {
        seenByA.push(svc.getTenantId());
        await tick(); // força interleaving real com o request B
        seenByA.push(svc.getTenantId());
      }),
      svc.run({ tenantId: 'tenant-B', isPlatform: true }, async () => {
        seenByB.push(svc.getTenantId());
        await tick();
        seenByB.push(svc.getTenantId());
      }),
    ]);

    expect(seenByA).toEqual(['tenant-A', 'tenant-A']);
    expect(seenByB).toEqual(['tenant-B', 'tenant-B']);
  });

  it('isPlatform também não vaza entre requests concorrentes', async () => {
    const { prisma } = fakeTransactionalPrisma();
    const svc = new RequestContextService(prisma);

    const results: boolean[] = [];
    await Promise.all([
      svc.run({ tenantId: 't1', isPlatform: true }, async () => {
        await tick();
        results.push(svc.isPlatform());
      }),
      svc.run({ tenantId: 't2', isPlatform: false }, async () => {
        await tick();
        results.push(svc.isPlatform());
      }),
    ]);

    expect(results.sort()).toEqual([false, true]);
  });
});
