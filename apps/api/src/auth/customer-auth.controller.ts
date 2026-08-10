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
import { type EmailAddress, parseEmail, parsePhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import type { Response } from 'express';
import type { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import type { EmailProvider } from '../messaging/email-provider.port';
import { EMAIL_PROVIDER, MESSAGING_PROVIDER } from '../messaging/messaging.module';
import type { MessagingProvider } from '../messaging/messaging-provider.port';
import { otpChannelFor } from '../messaging/otp-channel';
import { identityOnly, phoneIdentityViaEmail, phoneRecipient } from './otp/otp-recipient';
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
    // Os dois canais injetados; qual entrega sai de otpChannelFor('customer').
    // A IDENTIDADE do cliente é o telefone nos dois casos — só o canal muda.
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
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
    const tenantId = await this.resolveTenantId(slug); // 404 se a loja não existe

    try {
      if (!dto.phone) throw new BadRequestException('Informe o telefone.');
      const phone = parsePhoneNumber(dto.phone);

      let recipient;
      if (otpChannelFor('customer') === 'email') {
        // E-mail exigido SEMPRE, antes de qualquer consulta: se a exigência
        // dependesse de já existir vínculo, omitir o campo viraria oráculo de
        // enumeração (cliente existente respondendo 202, novo respondendo
        // 400). O request tem que responder igual pros dois.
        if (!dto.email) throw new BadRequestException('Informe o e-mail.');
        const digitado = parseEmail(dto.email);

        // TOFU (trust on first use): se este telefone JÁ tem e-mail vinculado,
        // o código vai pro e-mail DE REGISTRO e o digitado é IGNORADO. Sem
        // isso, qualquer um digitaria o telefone da vítima + o próprio e-mail
        // e tomaria a conta — com entrega por e-mail o fator verificado é o
        // e-mail, e o telefone passa a ser auto-declarado (docs/08).
        const bound: EmailAddress | null = await this.requestContext.run(
          { tenantId, isPlatform: false },
          () => this.customerIdentity.findBoundEmail(tenantId, phone),
        );
        recipient = phoneIdentityViaEmail(phone, bound ?? digitado, this.email);
      } else {
        recipient = phoneRecipient(phone, this.messaging);
      }

      await this.otpService.requestOtp(`customer:${slug}`, recipient, req.ip ?? '0.0.0.0');
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
    let email: EmailAddress | undefined;
    try {
      if (!dto.phone) throw new BadRequestException('Informe o telefone.');
      phone = parsePhoneNumber(dto.phone);
      // Só pra gravar o vínculo do TOFU quando ainda não existe — a identidade
      // continua sendo o telefone, e o e-mail nunca sobrescreve um vínculo já
      // gravado (ver CustomerIdentityRepository.findOrCreate).
      email = dto.email ? parseEmail(dto.email) : undefined;
    } catch (error) {
      throw toAuthHttpException(error);
    }

    const ip = req.ip ?? '0.0.0.0';
    // Chave do desafio é o E.164 — a MESMA do SMS, em qualquer canal. É isso
    // que faz a volta pro SMS ser troca de env, sem invalidar desafio em voo.
    const ok = await this.otpService.verifyOtp(
      `customer:${slug}`,
      identityOnly(phoneNumberToE164(phone)),
      dto.code,
      ip,
    );
    if (!ok) throw new BadRequestException('Código inválido ou expirado.');

    return this.requestContext.run({ tenantId, isPlatform: false }, async () => {
      // `verified: true` — este é o caminho que ACABOU de provar o telefone por
      // OTP; é o único que carimba `phone_verified_at` (Épico 9c).
      const { identity } = await this.customerIdentity.findOrCreate(tenantId, phone, { email, verified: true });
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
