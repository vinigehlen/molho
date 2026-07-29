import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { parsePhoneNumber } from '@molho/contracts';
import type { Response } from 'express';
import type { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MessagingProvider } from '../messaging/messaging-provider.port';
import { phoneRecipient } from './otp/otp-recipient';
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

const SCOPE = 'staff';

/**
 * Login do backoffice — sempre global, nunca preso a um :slug (staff pode
 * ter user_roles em vários tenants). Cria o User na 1ª verificação, SEM
 * nenhum user_role (ver nota em staff-identity.repository.ts).
 */
@Controller('v1/auth/otp')
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
    // Canal de entrega do OTP. No piloto (Épico 9c) staff vai por e-mail; hoje,
    // ainda SMS via phoneRecipient (o canal por escopo entra no passo 3). O
    // OtpService não conhece o canal — o controller monta o recipiente.
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {
    this.staffIdentity = new StaffIdentityRepository(requestContext);
  }

  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Body() dto: OtpRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    try {
      const phone = parsePhoneNumber(dto.phone);
      await this.otpService.requestOtp(SCOPE, phoneRecipient(phone, this.messaging), req.ip ?? '0.0.0.0');
    } catch (error) {
      if (error instanceof OtpRateLimitedError) {
        res.set('Retry-After', String(retryAfterSecondsFor(error.kind)));
      }
      throw toAuthHttpException(error);
      // 202 pra QUALQUER telefone (exista ou não): não há branch de
      // existência de conta em nenhum caminho de sucesso deste método —
      // é isso que sustenta a anti-enumeração, não um try/catch escondendo.
    }
    return {};
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    let phone;
    try {
      phone = parsePhoneNumber(dto.phone);
    } catch (error) {
      throw toAuthHttpException(error);
    }

    const ip = req.ip ?? '0.0.0.0';
    const ok = await this.otpService.verifyOtp(SCOPE, phoneRecipient(phone, this.messaging), dto.code, ip);
    if (!ok) throw new BadRequestException('Código inválido ou expirado.');

    return this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      async () => {
        const { identity } = await this.staffIdentity.findOrCreate(phone);
        const userRepository = new PrismaUserAuthRepository(this.requestContext);
        const scopes = await userRepository.getRoleAssignments(identity.id);
        const roles = [...new Set(scopes.map((s) => s.role))];

        const tokens = await this.tokenService.issueTokens(identity.id, roles, scopes, {
          ip,
          userAgent: req.headers['user-agent'],
        });

        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: { id: identity.id, name: identity.name },
        };
      },
    );
  }
}
