import { describe, expect, it } from 'vitest';
import { InMemoryRefreshLookupStore } from './refresh-lookup-store';
import { InMemorySessionStore } from './session-store';
import { ExpiredTokenError, InvalidTokenError, ReusedRefreshError, RevokedTokenError } from './token-errors';
import type { TokenScope } from './token-payload';
import { TokenService } from './token.service';
import { InMemoryUserVersionCache } from './user-version-cache';
import type { UserAuthRepository } from './user-version-repository';

const JWT_SECRETS = { '1': 'chave-de-teste-nao-usar-em-producao' };
const USER_ID = 'user-1';
const DEVICE: { ip: string; userAgent: string } = { ip: '203.0.113.10', userAgent: 'vitest' };
const SCOPES: TokenScope[] = [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }];

class FakeUserAuthRepository implements UserAuthRepository {
  versions = new Map<string, number>();
  roles = new Map<string, TokenScope[]>();

  async getTokenVersion(userId: string): Promise<number> {
    return this.versions.get(userId) ?? 0;
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const next = (this.versions.get(userId) ?? 0) + 1;
    this.versions.set(userId, next);
    return next;
  }

  async getRoleAssignments(userId: string): Promise<TokenScope[]> {
    return this.roles.get(userId) ?? [];
  }
}

function setup(overrides: { accessTokenTtlSeconds?: number; now?: () => number } = {}) {
  const userRepository = new FakeUserAuthRepository();
  userRepository.versions.set(USER_ID, 0);
  userRepository.roles.set(USER_ID, SCOPES);
  const userVersionCache = new InMemoryUserVersionCache(overrides.now);
  const sessionStore = new InMemorySessionStore(overrides.now);
  const refreshLookupStore = new InMemoryRefreshLookupStore(overrides.now);

  const service = new TokenService({
    jwtSecrets: JWT_SECRETS,
    userRepository,
    sessionStore,
    refreshLookupStore,
    userVersionCache,
    accessTokenTtlSeconds: overrides.accessTokenTtlSeconds,
  });

  return { service, userRepository, userVersionCache, sessionStore, refreshLookupStore };
}

describe('TokenService.issueTokens', () => {
  it('1) gera par válido com todos os campos', async () => {
    const { service } = setup();
    const tokens = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.deviceId).toBeTruthy();
  });
});

describe('TokenService.verifyAccessToken', () => {
  it('2) aceita token válido e devolve o payload', async () => {
    const { service } = setup();
    const { accessToken, deviceId } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    const payload = await service.verifyAccessToken(accessToken);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.roles).toEqual(['owner']);
    expect(payload.scopes).toEqual(SCOPES);
    expect(payload.deviceId).toBe(deviceId);
  });

  it('3) token expirado (15min+) é rejeitado com ExpiredTokenError', async () => {
    const { service } = setup({ accessTokenTtlSeconds: -1 }); // já nasce expirado
    const { accessToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    await expect(service.verifyAccessToken(accessToken)).rejects.toBeInstanceOf(ExpiredTokenError);
  });

  it('4) token_version++ no banco derruba o token na próxima verificação (força invalidação do cache)', async () => {
    const { service, userRepository, userVersionCache } = setup();
    const { accessToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    // ainda dentro do cache de 60s: verify passa normal (e popula o cache).
    await expect(service.verifyAccessToken(accessToken)).resolves.toBeDefined();

    // token_version muda por fora (ex.: outra ação administrativa, não pelo
    // TokenService) — sem invalidar o cache, o verify serviria a versão
    // antiga por até 60s. O teste força a invalidação em vez de esperar o
    // TTL de verdade.
    await userRepository.incrementTokenVersion(USER_ID);
    await userVersionCache.invalidate(USER_ID);

    await expect(service.verifyAccessToken(accessToken)).rejects.toBeInstanceOf(RevokedTokenError);
  });

  it('token com kid desconhecido é rejeitado', async () => {
    const { service } = setup();
    await expect(service.verifyAccessToken('token.invalido.aqui')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});

describe('TokenService.rotateTokens', () => {
  it('5) gera par novo; o refresh anterior fica inválido', async () => {
    const { service } = setup();
    const { refreshToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    const rotated = await service.rotateTokens(refreshToken, DEVICE);
    expect(rotated.refreshToken).not.toBe(refreshToken);

    await expect(service.rotateTokens(refreshToken, DEVICE)).rejects.toBeInstanceOf(ReusedRefreshError);
  });

  it('6) refresh usado 2x: ReusedRefreshError + TODAS as sessões do user derrubadas', async () => {
    const { service } = setup();
    const { refreshToken, accessToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    await service.rotateTokens(refreshToken, DEVICE); // 1ª vez: legítima
    await expect(service.rotateTokens(refreshToken, DEVICE)).rejects.toBeInstanceOf(ReusedRefreshError); // 2ª: reuso

    // token_version subiu (revokeAllSessions rodou) — o access token antigo
    // (emitido antes de qualquer rotação) já era revogado.
    await expect(service.verifyAccessToken(accessToken)).rejects.toBeInstanceOf(RevokedTokenError);
  });

  it('7) revokeSession(userId, deviceId) invalida só aquele dispositivo, outros seguem', async () => {
    const { service } = setup();
    const a = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);
    const b = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    await service.revokeSession(USER_ID, a.deviceId);

    await expect(service.rotateTokens(a.refreshToken, DEVICE)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(service.rotateTokens(b.refreshToken, DEVICE)).resolves.toBeDefined();
  });

  it('8) revokeAllSessions incrementa token_version e limpa todas as sessões', async () => {
    const { service, userRepository } = setup();
    const a = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);
    const b = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    await service.revokeAllSessions(USER_ID);

    expect(await userRepository.getTokenVersion(USER_ID)).toBe(1);
    await expect(service.rotateTokens(a.refreshToken, DEVICE)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(service.rotateTokens(b.refreshToken, DEVICE)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rotação reemite roles/scopes ATUAIS, não os salvos no login original', async () => {
    const { service, userRepository } = setup();
    const { refreshToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    // papel do usuário muda depois do login original.
    userRepository.roles.set(USER_ID, [{ role: 'manager', scopeType: 'store', scopeId: 'loja-1' }]);

    const rotated = await service.rotateTokens(refreshToken, DEVICE);
    const payload = await service.verifyAccessToken(rotated.accessToken);

    expect(payload.roles).toEqual(['manager']);
    expect(payload.scopes).toEqual([{ role: 'manager', scopeType: 'store', scopeId: 'loja-1' }]);
  });

  it('9) TTL deslizante: refresh usado ao 25º dia continua ativo por mais 30 dias', async () => {
    let clock = 0;
    const { service } = setup({ now: () => clock });
    const DAY_MS = 24 * 60 * 60 * 1000;

    const { refreshToken: r0 } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    clock += 25 * DAY_MS; // dia 25 — dentro da janela original de 30 dias
    const { refreshToken: r25 } = await service.rotateTokens(r0, DEVICE);

    clock += 25 * DAY_MS; // mais 25 dias (dia 50 desde o início) — só válido
    // porque o uso no dia 25 renovou a janela pra mais 30 dias a partir dali.
    await expect(service.rotateTokens(r25, DEVICE)).resolves.toBeDefined();
  });

  it('sem tocar por 30 dias, a sessão expira de verdade (contraste com o teste acima)', async () => {
    let clock = 0;
    const { service } = setup({ now: () => clock });
    const DAY_MS = 24 * 60 * 60 * 1000;

    const { refreshToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    clock += 30 * DAY_MS + 1;
    await expect(service.rotateTokens(refreshToken, DEVICE)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('10) refresh concorrente: só um sucede, o outro é ReusedRefreshError', async () => {
    const { service } = setup();
    const { refreshToken } = await service.issueTokens(USER_ID, ['owner'], SCOPES, DEVICE);

    const results = await Promise.allSettled([
      service.rotateTokens(refreshToken, DEVICE),
      service.rotateTokens(refreshToken, DEVICE),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ReusedRefreshError);
  });

  it('refresh desconhecido (nunca existiu) é InvalidTokenError, não ReusedRefreshError', async () => {
    const { service } = setup();
    await expect(service.rotateTokens('token-que-nunca-existiu', DEVICE)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});
