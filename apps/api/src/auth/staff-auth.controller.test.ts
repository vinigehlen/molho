import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '../context/request-context.service';
import type { EmailProvider } from '../messaging/email-provider.port';
import type { MessagingProvider } from '../messaging/messaging-provider.port';
import type { OtpService } from './otp/otp.service';
import { StaffAuthController } from './staff-auth.controller';
import { ReusedRefreshError } from './token/token-errors';
import type { TokenService } from './token/token.service';
import type { RequestWithUser } from './guards/jwt-auth.guard';

const rotated = { accessToken: 'access-new', refreshToken: 'refresh-new' };

function request(headers: Record<string, string> = {}): Request {
  return { headers, ip: '127.0.0.1' } as Request;
}

function response() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
}

describe('StaffAuthController — sessão web', () => {
  let tokenService: Pick<TokenService, 'rotateTokens' | 'revokeSession'>;
  let controller: StaffAuthController;

  beforeEach(() => {
    tokenService = {
      rotateTokens: vi.fn().mockResolvedValue(rotated),
      revokeSession: vi.fn().mockResolvedValue(undefined),
    };
    const requestContext = {
      run: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    } as unknown as RequestContextService;
    controller = new StaffAuthController(
      {} as OtpService,
      tokenService as TokenService,
      requestContext,
      {} as MessagingProvider,
      {} as EmailProvider,
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('expõe o canal configurado sem duplicar env no frontend', () => {
    vi.stubEnv('OTP_CHANNEL_STAFF', 'email');
    expect(controller.config()).toEqual({ channel: 'email' });
  });

  it('exige header do backoffice antes de aceitar o refresh cookie', async () => {
    await expect(
      controller.refresh(request({ cookie: '__Host-molho_refresh=refresh-old' }), response()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokenService.rotateTokens).not.toHaveBeenCalled();
  });

  it('rotaciona o refresh e regrava cookie __Host- seguro', async () => {
    const res = response();
    await expect(
      controller.refresh(
        request({ 'x-molho-client': 'backoffice', cookie: 'outro=x; __Host-molho_refresh=refresh-old' }),
        res,
      ),
    ).resolves.toEqual({ accessToken: 'access-new' });

    expect(tokenService.rotateTokens).toHaveBeenCalledWith(
      'refresh-old',
      expect.objectContaining({ ip: '127.0.0.1' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      '__Host-molho_refresh',
      'refresh-new',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }),
    );
  });

  it('limpa o cookie e responde 401 quando detecta reuso', async () => {
    vi.mocked(tokenService.rotateTokens).mockRejectedValueOnce(new ReusedRefreshError('user-1'));
    const res = response();
    await expect(
      controller.refresh(
        request({ 'x-molho-client': 'backoffice', cookie: '__Host-molho_refresh=refresh-old' }),
        res,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalledWith(
      '__Host-molho_refresh',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }),
    );
  });

  it('logout revoga somente o dispositivo autenticado e limpa o cookie', async () => {
    const res = response();
    const req = request({ 'x-molho-client': 'backoffice' }) as RequestWithUser;
    req.user = {
      sub: 'user-1',
      deviceId: 'device-1',
      roles: ['owner'],
      scopes: [],
      tokenVersion: 0,
      jti: 'jti-1',
      exp: 1,
    };
    await controller.logout(req, res);
    expect(tokenService.revokeSession).toHaveBeenCalledWith('user-1', 'device-1');
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
