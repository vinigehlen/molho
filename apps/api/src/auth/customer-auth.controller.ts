import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
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
import { CUSTOMER_TOKEN_SERVICE } from './token/token.module';
import type { TokenService } from './token/token.service';
import { PrismaCustomerAuthRepository } from './token/customer-auth-repository';
import { retryAfterSecondsFor, toAuthHttpException } from './auth-http.util';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { OtpRateLimitedError } from './otp/otp-errors';
import { CustomerIdentityRepository } from './customer-identity.repository';
import { TenantLookupRepository } from './tenant-lookup.repository';

/**
 * Login do cliente final — sempre preso a um :slug (a identidade em si já
 * nasce por tenant, ver CLAUDE.md "Duas semânticas de identidade"). Resolver
 * o tenant a partir do slug é uma busca cross-tenant (roda com
 * isPlatform=true); tudo depois disso roda escopado ao tenant resolvido.
 */
@Controller('v1/store/:slug/auth/otp')
export class CustomerAuthController {
  private readonly tenantLookup: TenantLookupRepository;
  private readonly customerIdentity: CustomerIdentityRepository;

  constructor(
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokenService: TokenService,
    // @Inject explícito — ver nota em staff-auth.controller.ts (esbuild do
    // Vitest não emite emitDecoratorMetadata de forma confiável pra DI
    // implícita por tipo).
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    // Canal de entrega do OTP — hoje SMS via phoneRecipient; o canal por escopo
    // (e-mail no piloto) entra no passo 3. O OtpService não conhece o canal.
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {
    this.tenantLookup = new TenantLookupRepository(requestContext);
    this.customerIdentity = new CustomerIdentityRepository(requestContext);
  }

  private async resolveTenantId(slug: string): Promise<string> {
    const tenant = await this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      () => this.tenantLookup.findBySlug(slug),
    );
    if (!tenant) throw new NotFoundException('Loja não encontrada.');
    return tenant.id;
  }

  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Param('slug') slug: string,
    @Body() dto: OtpRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, never>> {
    await this.resolveTenantId(slug); // 404 se a loja não existe

    try {
      const phone = parsePhoneNumber(dto.phone);
      await this.otpService.requestOtp(`customer:${slug}`, phoneRecipient(phone, this.messaging), req.ip ?? '0.0.0.0');
    } catch (error) {
      if (error instanceof OtpRateLimitedError) {
        res.set('Retry-After', String(retryAfterSecondsFor(error.kind)));
      }
      throw toAuthHttpException(error);
    }
    return {};
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Param('slug') slug: string, @Body() dto: OtpVerifyDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(slug);

    let phone;
    try {
      phone = parsePhoneNumber(dto.phone);
    } catch (error) {
      throw toAuthHttpException(error);
    }

    const ip = req.ip ?? '0.0.0.0';
    const ok = await this.otpService.verifyOtp(`customer:${slug}`, phoneRecipient(phone, this.messaging), dto.code, ip);
    if (!ok) throw new BadRequestException('Código inválido ou expirado.');

    return this.requestContext.run({ tenantId, isPlatform: false }, async () => {
      const { identity } = await this.customerIdentity.findOrCreate(tenantId, phone);
      const customerRepository = new PrismaCustomerAuthRepository(this.requestContext);
      const scopes = await customerRepository.getRoleAssignments();

      const tokens = await this.tokenService.issueTokens(identity.id, [], scopes, {
        ip,
        userAgent: req.headers['user-agent'],
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: identity.id, name: identity.name },
      };
    });
  }
}
