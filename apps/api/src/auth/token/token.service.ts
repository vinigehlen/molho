import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError, ReusedRefreshError } from './token-errors';
import type { RefreshLookupStore } from './refresh-lookup-store';
import type { SessionStore } from './session-store';
import { currentJwtKeyVersion } from './token-payload';
import type { DeviceInfo, TokenPayload, TokenScope } from './token-payload';
import type { UserAuthRepository } from './user-version-repository';
import type { UserVersionCache } from './user-version-cache';

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface TokenServiceDeps {
  /** MOLHO_JWT_SECRETS — mapa versão→chave, separada de MOLHO_ENCRYPTION_KEYS/MOLHO_OTP_HMAC_KEY. */
  jwtSecrets: Record<string, string>;
  userRepository: UserAuthRepository;
  sessionStore: SessionStore;
  refreshLookupStore: RefreshLookupStore;
  userVersionCache: UserVersionCache;
  accessTokenTtlSeconds?: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * JWT access (15min) + refresh opaco (30 dias, sliding, rotação a cada uso)
 * — classe pura sem decorators do Nest (mesmo padrão de OtpService), mas
 * depende de UserAuthRepository, que por baixo dos panos usa
 * RequestContextService pra tocar `users`/`user_roles` (nunca PrismaClient
 * direto — CLAUDE.md § Contexto de request).
 *
 * deviceId é sempre gerado no servidor (randomUUID), nunca vem do cliente —
 * o refresh token já carrega a referência pra sessão certa via
 * RefreshLookupStore, não precisa do cliente ecoar nada.
 */
export class TokenService {
  private readonly jwtSecrets: Record<string, string>;
  private readonly userRepository: UserAuthRepository;
  private readonly sessionStore: SessionStore;
  private readonly refreshLookupStore: RefreshLookupStore;
  private readonly userVersionCache: UserVersionCache;
  private readonly accessTokenTtlSeconds: number;

  constructor(deps: TokenServiceDeps) {
    this.jwtSecrets = deps.jwtSecrets;
    this.userRepository = deps.userRepository;
    this.sessionStore = deps.sessionStore;
    this.refreshLookupStore = deps.refreshLookupStore;
    this.userVersionCache = deps.userVersionCache;
    this.accessTokenTtlSeconds = deps.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }

  async issueTokens(
    userId: string,
    roles: string[],
    scopes: TokenScope[],
    device: DeviceInfo,
  ): Promise<IssuedTokens> {
    const deviceId = randomUUID();
    const tokenVersion = await this.userRepository.getTokenVersion(userId);

    const accessToken = this.signAccessToken({
      sub: userId,
      roles,
      scopes,
      tokenVersion,
      deviceId,
      jti: randomUUID(),
    });
    const refreshToken = this.generateRefreshToken();
    const refreshHash = this.hashRefresh(refreshToken);

    await this.sessionStore.create(userId, deviceId, refreshHash, tokenVersion, device);
    await this.refreshLookupStore.create(refreshHash, userId, deviceId);

    return { accessToken, refreshToken, deviceId };
  }

  /**
   * Rotaciona SEMPRE que chamado com sucesso: novo access + novo refresh,
   * o refresh anterior fica permanentemente inválido (não só expira). Se o
   * refresh apresentado já tinha sido consumido antes (reuso — cliente
   * duplicado ou token roubado), derruba TODAS as sessões do user.
   */
  async rotateTokens(refreshToken: string, device: DeviceInfo): Promise<RotatedTokens> {
    const oldHash = this.hashRefresh(refreshToken);
    const result = await this.refreshLookupStore.consume(oldHash);

    if (result.status === 'unknown') {
      throw new InvalidTokenError('refresh token desconhecido ou expirado');
    }
    if (result.status === 'reused') {
      await this.revokeAllSessions(result.userId);
      throw new ReusedRefreshError(result.userId);
    }

    const { userId, deviceId } = result;
    const [tokenVersion, scopes] = await Promise.all([
      this.userRepository.getTokenVersion(userId),
      this.userRepository.getRoleAssignments(userId),
    ]);
    const roles = [...new Set(scopes.map((s) => s.role))];

    const accessToken = this.signAccessToken({
      sub: userId,
      roles,
      scopes,
      tokenVersion,
      deviceId,
      jti: randomUUID(),
    });
    const newRefreshToken = this.generateRefreshToken();
    const newHash = this.hashRefresh(newRefreshToken);

    await this.refreshLookupStore.create(newHash, userId, deviceId);
    await this.sessionStore.touch(userId, deviceId, newHash, device.ip);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async revokeSession(userId: string, deviceId: string): Promise<void> {
    const session = await this.sessionStore.get(userId, deviceId);
    if (session) {
      await this.refreshLookupStore.delete(session.refreshHash);
    }
    await this.sessionStore.delete(userId, deviceId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.userRepository.incrementTokenVersion(userId);
    // Invalidação proativa — não espera o TTL de 60s do cache pra propagar
    // uma ação de segurança que o usuário quer efeito imediato.
    await this.userVersionCache.invalidate(userId);

    const deviceIds = await this.sessionStore.listDeviceIds(userId);
    for (const deviceId of deviceIds) {
      const session = await this.sessionStore.get(userId, deviceId);
      if (session) await this.refreshLookupStore.delete(session.refreshHash);
      await this.sessionStore.delete(userId, deviceId);
    }
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded.payload === 'string') {
      throw new InvalidTokenError('formato de token inválido');
    }

    const kid = decoded.header.kid;
    const secret = kid ? this.jwtSecrets[kid] : undefined;
    if (!secret) throw new InvalidTokenError('kid desconhecido ou ausente');

    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as unknown as TokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new ExpiredTokenError();
      throw new InvalidTokenError(error instanceof Error ? error.message : String(error));
    }

    let currentVersion = await this.userVersionCache.get(payload.sub);
    if (currentVersion === null) {
      currentVersion = await this.userRepository.getTokenVersion(payload.sub);
      await this.userVersionCache.set(payload.sub, currentVersion);
    }
    if (payload.tokenVersion < currentVersion) throw new RevokedTokenError();

    return payload;
  }

  private signAccessToken(payload: TokenPayload): string {
    const version = currentJwtKeyVersion(this.jwtSecrets);
    const secret = this.jwtSecrets[version];
    if (!secret) throw new Error(`sem chave JWT pra versão "${version}"`);
    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: this.accessTokenTtlSeconds,
      keyid: version,
    });
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
