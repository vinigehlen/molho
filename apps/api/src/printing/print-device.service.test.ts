import { Prisma } from '@molho/db';
import { describe, expect, it, vi } from 'vitest';
import type { PrintDeviceRepository, PrintDeviceSummary } from './print-device.repository';
import {
  PrintDeviceNameConflictError,
  PrintDeviceNotFoundError,
  PrintDeviceService,
} from './print-device.service';
import { hashDeviceSecret } from './print-device-secret';

function summary(over: Partial<PrintDeviceSummary> = {}): PrintDeviceSummary {
  return {
    id: 'dev-1',
    name: 'Cozinha',
    tokenPrefix: 'abcdefghijkl',
    version: 0,
    lastSeenAt: null,
    revokedAt: null,
    createdAt: new Date('2026-09-09T00:00:00Z'),
    ...over,
  };
}

function fakeRepo(over: Partial<PrintDeviceRepository> = {}): PrintDeviceRepository {
  return {
    create: vi.fn(async ({ name }) => summary({ name })),
    list: vi.fn(async () => [summary()]),
    findById: vi.fn(async () => summary()),
    findActiveByPrefix: vi.fn(async () => null),
    rotate: vi.fn(async () => summary({ version: 1 })),
    revoke: vi.fn(async () => true),
    touchLastSeen: vi.fn(async () => undefined),
    writeAudit: vi.fn(async () => undefined),
    ...over,
  };
}

const actor = { userId: 'user-1', role: 'owner' };

describe('PrintDeviceService.pair', () => {
  it('devolve o segredo em claro uma vez e grava auditoria', async () => {
    const repo = fakeRepo();
    const svc = new PrintDeviceService(repo);
    const { device, secret } = await svc.pair('Cozinha', actor);

    expect(secret.startsWith('molho_pd_')).toBe(true);
    expect(device.name).toBe('Cozinha');
    expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'print_device.paired' }));
    // o segredo em claro NUNCA é passado pro repo
    const createArg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(JSON.stringify(createArg)).not.toContain(secret);
  });

  it('traduz P2002 (nome duplicado) em erro de domínio', async () => {
    const repo = fakeRepo({
      create: vi.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
      }),
    });
    await expect(new PrintDeviceService(repo).pair('Cozinha', actor)).rejects.toBeInstanceOf(PrintDeviceNameConflictError);
  });
});

describe('PrintDeviceService.rotate / revoke', () => {
  it('rotate gera segredo novo e audita', async () => {
    const repo = fakeRepo();
    const { secret } = await new PrintDeviceService(repo).rotate('dev-1', actor);
    expect(secret.startsWith('molho_pd_')).toBe(true);
    expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'print_device.rotated' }));
  });

  it('rotate em dispositivo inexistente/revogado → NotFound', async () => {
    const repo = fakeRepo({ rotate: vi.fn(async () => null) });
    await expect(new PrintDeviceService(repo).rotate('x', actor)).rejects.toBeInstanceOf(PrintDeviceNotFoundError);
  });

  it('revoke audita; inexistente → NotFound', async () => {
    const ok = fakeRepo();
    await new PrintDeviceService(ok).revoke('dev-1', actor);
    expect(ok.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'print_device.revoked' }));

    const missing = fakeRepo({ revoke: vi.fn(async () => false) });
    await expect(new PrintDeviceService(missing).revoke('x', actor)).rejects.toBeInstanceOf(PrintDeviceNotFoundError);
  });
});

describe('PrintDeviceService.authenticate', () => {
  const secret = 'molho_pd_' + 'A'.repeat(43);
  const tokenPrefix = 'AAAAAAAAAAAA';

  it('aceita segredo válido de dispositivo ativo e faz heartbeat', async () => {
    const repo = fakeRepo({
      findActiveByPrefix: vi.fn(async () => ({
        id: 'dev-1',
        tenantId: 'tenant-1',
        tokenHash: hashDeviceSecret(secret),
        version: 0,
        revokedAt: null,
      })),
    });
    const result = await new PrintDeviceService(repo).authenticate(secret);
    expect(result).toEqual({ id: 'dev-1', tenantId: 'tenant-1' });
    expect(repo.touchLastSeen).toHaveBeenCalledWith('dev-1', 60);
    expect((repo.findActiveByPrefix as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(tokenPrefix);
  });

  it('recusa: formato inválido, prefixo desconhecido, hash errado, revogado', async () => {
    expect(await new PrintDeviceService(fakeRepo()).authenticate('Bearer xyz')).toBeNull();
    expect(await new PrintDeviceService(fakeRepo()).authenticate(secret)).toBeNull(); // findActiveByPrefix → null

    const wrongHash = fakeRepo({
      findActiveByPrefix: vi.fn(async () => ({
        id: 'd',
        tenantId: 't',
        tokenHash: hashDeviceSecret('molho_pd_' + 'B'.repeat(43)),
        version: 0,
        revokedAt: null,
      })),
    });
    expect(await new PrintDeviceService(wrongHash).authenticate(secret)).toBeNull();

    const revoked = fakeRepo({
      findActiveByPrefix: vi.fn(async () => ({
        id: 'd',
        tenantId: 't',
        tokenHash: hashDeviceSecret(secret),
        version: 0,
        revokedAt: new Date(),
      })),
    });
    expect(await new PrintDeviceService(revoked).authenticate(secret)).toBeNull();
  });

  it('heartbeat que falha não quebra a autenticação', async () => {
    const repo = fakeRepo({
      findActiveByPrefix: vi.fn(async () => ({
        id: 'dev-1',
        tenantId: 'tenant-1',
        tokenHash: hashDeviceSecret(secret),
        version: 0,
        revokedAt: null,
      })),
      touchLastSeen: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    await expect(new PrintDeviceService(repo).authenticate(secret)).resolves.toEqual({ id: 'dev-1', tenantId: 'tenant-1' });
  });
});
