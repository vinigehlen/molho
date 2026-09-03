import { describe, expect, it, vi } from 'vitest';
import type { StartImpersonationInput } from '@molho/contracts';
import { ScopeNotFoundError } from './staff-provisioning.errors';
import type { ImpersonationRepository, ImpersonationTenant } from './impersonation.repository';
import { ImpersonationService } from './impersonation.service';

const TENANT: ImpersonationTenant = { id: 'tenant-1', slug: 'demo', name: 'Demo' };
const ACTOR = { id: 'admin-1', role: 'platform.superadmin' };

function baseInput(overrides: Partial<StartImpersonationInput> = {}): StartImpersonationInput {
  return { reason: 'Investigar bug relatado pelo lojista.', readOnly: true, ...overrides };
}

function setup(options: { tenant?: ImpersonationTenant | null; ownerEmail?: string | null; emailFails?: boolean } = {}) {
  const repo: ImpersonationRepository = {
    findTenant: vi.fn().mockResolvedValue(options.tenant === undefined ? TENANT : options.tenant),
    findOwnerEmail: vi.fn().mockResolvedValue(options.ownerEmail ?? null),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
  } as unknown as ImpersonationRepository;

  const tokenService = {
    issueImpersonationToken: vi.fn().mockResolvedValue({
      accessToken: 'token-fake',
      expiresAt: new Date('2026-01-01T00:30:00Z'),
    }),
  };

  const emailProvider = {
    send: options.emailFails
      ? vi.fn().mockRejectedValue(new Error('resend fora do ar'))
      : vi.fn().mockResolvedValue(undefined),
  };

  const logger = { warn: vi.fn() };

  const service = new ImpersonationService(repo, tokenService as never, emailProvider as never, logger);
  return { service, repo, tokenService, emailProvider, logger };
}

describe('ImpersonationService.start', () => {
  it('tenant inexistente propaga ScopeNotFoundError (controller já sabe mapear pra 404)', async () => {
    const { service } = setup({ tenant: null });
    await expect(service.start('tenant-1', baseInput(), ACTOR)).rejects.toBeInstanceOf(ScopeNotFoundError);
  });

  it('emite token com o TTL de 30min e o readOnly pedido', async () => {
    const { service, tokenService } = setup();
    await service.start('tenant-1', baseInput({ readOnly: false }), ACTOR);

    expect(tokenService.issueImpersonationToken).toHaveBeenCalledWith('admin-1', 'tenant-1', {
      readOnly: false,
      ttlSeconds: 30 * 60,
    });
  });

  it('grava audit_log com o ATOR REAL antes de tentar notificar (auditoria não depende do e-mail)', async () => {
    const { service, repo } = setup({ ownerEmail: null });
    await service.start('tenant-1', baseInput(), ACTOR);

    expect(repo.recordAuditLog).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'admin-1',
      actorRole: 'platform.superadmin',
      reason: baseInput().reason,
      readOnly: true,
      expiresAt: new Date('2026-01-01T00:30:00Z'),
    });
  });

  it('sem e-mail de owner cadastrado: não tenta enviar nada, não quebra', async () => {
    const { service, emailProvider } = setup({ ownerEmail: null });
    await expect(service.start('tenant-1', baseInput(), ACTOR)).resolves.toBeDefined();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('com e-mail de owner: notifica com motivo e prazo', async () => {
    const { service, emailProvider } = setup({ ownerEmail: 'dono@loja.com' });
    await service.start('tenant-1', baseInput({ reason: 'Motivo do acesso.' }), ACTOR);

    expect(emailProvider.send).toHaveBeenCalledWith(
      'dono@loja.com',
      expect.stringContaining('Demo'),
      expect.stringContaining('Motivo do acesso.'),
    );
  });

  it('falha no envio do e-mail NUNCA derruba a sessão já concedida — só loga um warning', async () => {
    const { service, logger } = setup({ ownerEmail: 'dono@loja.com', emailFails: true });
    const result = await service.start('tenant-1', baseInput(), ACTOR);

    expect(result.accessToken).toBe('token-fake');
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('resposta reflete tenant/readOnly/expiresAt pedidos', async () => {
    const { service } = setup();
    const result = await service.start('tenant-1', baseInput({ readOnly: false }), ACTOR);

    expect(result).toEqual({
      accessToken: 'token-fake',
      tenantId: 'tenant-1',
      tenantSlug: 'demo',
      tenantName: 'Demo',
      readOnly: false,
      expiresAt: '2026-01-01T00:30:00.000Z',
    });
  });
});
