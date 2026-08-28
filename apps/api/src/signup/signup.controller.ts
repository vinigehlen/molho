import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  parseEmail,
  signupRequestOtpSchema,
  signupVerifySchema,
  type SignupRequestOtpInput,
  type SignupSlugAvailability,
  type SignupVerifyInput,
  type SignupVerifyResponse,
} from '@molho/contracts';
import type { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { TOKEN_SERVICE } from '../auth/token/token.module';
import type { TokenService } from '../auth/token/token.service';
import { SignupInvalidCodeError, SignupRateLimitedError } from './signup.errors';
import type { SignupOtpService } from './signup-otp.service';
import type { SignupProvisioningService } from './signup-provisioning.service';
import { SIGNUP_OTP_SERVICE, SIGNUP_PROVISIONING_SERVICE } from './signup.tokens';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';

const REFRESH_COOKIE = '__Host-molho_refresh';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

@Controller('v1/signup')
export class SignupController {
  constructor(
    @Inject(SIGNUP_OTP_SERVICE) private readonly otp: SignupOtpService,
    @Inject(SIGNUP_PROVISIONING_SERVICE) private readonly provisioning: SignupProvisioningService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(
    @Body(new ZodValidationPipe(signupRequestOtpSchema)) dto: SignupRequestOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    try {
      await this.otp.request(parseEmail(dto.email), req.ip ?? '0.0.0.0');
      return {};
    } catch (error) {
      if (error instanceof SignupRateLimitedError) {
        res.set('Retry-After', '3600');
        throw new HttpException(
          {
            error: 'rate_limited',
            message:
              error.kind === 'ip'
                ? 'Muitas tentativas de cadastro deste IP. Tente de novo mais tarde.'
                : 'Muitos códigos enviados para este e-mail. Tente de novo mais tarde.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException(error instanceof Error ? error.message : 'Payload inválido.');
    }
  }

  @Get('slug-available')
  async slugAvailable(@Query('slug') slug: string | undefined): Promise<SignupSlugAvailability> {
    const value = typeof slug === 'string' ? slug.trim() : '';
    if (!value) return { available: false };
    return this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, () =>
      this.provisioning.checkSlugAvailability(value),
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body(new ZodValidationPipe(signupVerifySchema)) dto: SignupVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignupVerifyResponse> {
    const email = parseEmail(dto.email);
    try {
      await this.otp.verify(email, dto.code);
    } catch (error) {
      if (error instanceof SignupInvalidCodeError) throw new UnauthorizedException(error.message);
      throw error;
    }

    const provisioned = await this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      () => this.provisioning.provision(dto),
    );
    const scopes = [{ role: 'owner', scopeType: 'tenant' as const, scopeId: provisioned.tenant.id }];
    const tokens = await this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      () =>
        this.tokenService.issueTokens(provisioned.accessUser.id, ['owner'], scopes, {
          ip: req.ip ?? '0.0.0.0',
          userAgent: req.headers['user-agent'],
        }),
    );
    setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      user: provisioned.accessUser,
      tenant: provisioned.tenant,
      store: provisioned.store,
      created: provisioned.created,
    };
  }
}
