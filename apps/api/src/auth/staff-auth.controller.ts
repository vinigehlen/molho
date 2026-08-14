import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { type EmailAddress, type PhoneNumber, parseEmail, parsePhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import type { Response } from 'express';
import type { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import type { EmailProvider } from '../messaging/email-provider.port';
import { EMAIL_PROVIDER, MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MessagingProvider } from '../messaging/messaging-provider.port';
import { otpChannelFor } from '../messaging/otp-channel';
import { emailRecipient, identityOnly, phoneRecipient } from './otp/otp-recipient';
import { OTP_SERVICE } from './otp/otp.module';
import type { OtpService } from './otp/otp.service';
import { TOKEN_SERVICE } from './token/token.module';
import type { TokenService } from './token/token.service';
import { PrismaUserAuthRepository } from './token/user-version-repository';
import { retryAfterSecondsFor, toAuthHttpException } from './auth-http.util';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { OtpRateLimitedError } from './otp/otp-errors';
import { StaffIdentityRepository } from './staff-identity.repository';
import { JwtAuthGuard, type RequestWithUser } from './guards/jwt-auth.guard';
import { InvalidTokenError, ReusedRefreshError } from './token/token-errors';

const SCOPE = 'staff';
const REFRESH_COOKIE = '__Host-molho_refresh';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BACKOFFICE_CLIENT_HEADER = 'x-molho-client';

function refreshCookieFrom(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return value.join('=') || null;
  }
  return null;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
}

function requireBackofficeClient(req: Request): void {
  if (req.headers[BACKOFFICE_CLIENT_HEADER] !== 'backoffice') {
    throw new ForbiddenException('Cliente do backoffice não identificado.');
  }
}

/**
 * Login do backoffice — sempre global, nunca preso a um :slug (staff pode
 * ter user_roles em vários tenants). Cria o User na 1ª verificação, SEM
 * nenhum user_role (ver nota em staff-identity.repository.ts).
 */
@Controller('v1/auth')
export class StaffAuthController {
  private readonly staffIdentity: StaffIdentityRepository;

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    // @Inject explícito (não implícito por tipo): a resolução implícita
    // depende de emitDecoratorMetadata via reflexão, que o esbuild do
    // Vitest não gera de forma confiável — achado rodando os testes e2e de
    // verdade (funcionava sob `nest start`, quebrava sob Vitest).
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    // Os DOIS canais de entrega ficam injetados; qual é usado sai de
    // otpChannelFor('staff') (env). O OtpService não conhece canal — o
    // controller monta o recipiente. Trocar de canal é trocar env.
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {
    this.staffIdentity = new StaffIdentityRepository(requestContext);
  }

  /**
   * Identificador de staff conforme o canal: e-mail é a CHAVE DE IDENTIDADE no
   * piloto (Épico 9c); telefone continua valendo pra rollback por env.
   * Campo ausente pro canal em uso é 400 com mensagem em pt-BR — a
   * obrigatoriedade é do canal, não do DTO (ver otp-request.dto.ts).
   */
  private identifierFor(
    dto: { phone?: string; email?: string },
  ): { channel: 'email'; email: EmailAddress } | { channel: 'sms'; phone: PhoneNumber } {
    if (otpChannelFor(SCOPE) === 'email') {
      if (!dto.email) throw new BadRequestException('Informe o e-mail.');
      return { channel: 'email', email: parseEmail(dto.email) };
    }
    if (!dto.phone) throw new BadRequestException('Informe o telefone.');
    return { channel: 'sms', phone: parsePhoneNumber(dto.phone) };
  }

  @Get('otp/config')
  config(): { channel: 'email' | 'sms' } {
    return { channel: otpChannelFor(SCOPE) };
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Body() dto: OtpRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    try {
      const identifier = this.identifierFor(dto);
      const recipient =
        identifier.channel === 'email'
          ? emailRecipient(identifier.email, this.email)
          : phoneRecipient(identifier.phone, this.messaging);
      await this.otpService.requestOtp(SCOPE, recipient, req.ip ?? '0.0.0.0');
    } catch (error) {
      if (error instanceof OtpRateLimitedError) {
        res.set('Retry-After', String(retryAfterSecondsFor(error.kind)));
      }
      throw toAuthHttpException(error);
      // 202 pra QUALQUER identificador (exista ou não): não há branch de
      // existência de conta em nenhum caminho de sucesso deste método —
      // é isso que sustenta a anti-enumeração, não um try/catch escondendo.
    }
    return {};
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: OtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let identifier;
    try {
      identifier = this.identifierFor(dto);
    } catch (error) {
      throw toAuthHttpException(error);
    }

    const ip = req.ip ?? '0.0.0.0';
    // identityOnly: verify não entrega nada, só precisa da chave do desafio —
    // e assim não há como um verify mandar SMS num deploy configurado
    // pra e-mail.
    const challengeKey =
      identifier.channel === 'email' ? identifier.email : phoneNumberToE164(identifier.phone);
    const invalidCode = () => new BadRequestException('Código inválido ou expirado.');
    const ok = await this.otpService.verifyOtp(SCOPE, identityOnly(challengeKey), dto.code, ip);
    if (!ok) throw invalidCode();

    return this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      async () => {
        const identity =
          identifier.channel === 'email'
            ? await this.staffIdentity.findByEmail(identifier.email)
            : await this.staffIdentity.findByPhone(identifier.phone);
        // Sem identity, ou identity sem nenhum papel: mesma resposta genérica
        // do código inválido — nunca distinguir "não achei" de "achei sem
        // papel", senão o endpoint vira oráculo de enumeração de e-mail staff.
        if (!identity) throw invalidCode();

        const userRepository = new PrismaUserAuthRepository(this.requestContext);
        const scopes = await userRepository.getRoleAssignments(identity.id);
        const roles = [...new Set(scopes.map((s) => s.role))];
        if (roles.length === 0) throw invalidCode();

        const tokens = await this.tokenService.issueTokens(identity.id, roles, scopes, {
          ip,
          userAgent: req.headers['user-agent'],
        });
        setRefreshCookie(res, tokens.refreshToken);

        return {
          accessToken: tokens.accessToken,
          user: { id: identity.id, name: identity.name },
        };
      },
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireBackofficeClient(req);
    const refreshToken = refreshCookieFrom(req);
    if (!refreshToken) throw new UnauthorizedException('Sessão expirada.');

    try {
      const tokens = await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () =>
          this.tokenService.rotateTokens(refreshToken, {
            ip: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'],
          }),
      );
      setRefreshCookie(res, tokens.refreshToken);
      return { accessToken: tokens.accessToken };
    } catch (error) {
      if (error instanceof InvalidTokenError || error instanceof ReusedRefreshError) {
        clearRefreshCookie(res);
        throw new UnauthorizedException('Sessão expirada.');
      }
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    requireBackofficeClient(req);
    await this.tokenService.revokeSession(req.user.sub, req.user.deviceId);
    clearRefreshCookie(res);
  }
}
