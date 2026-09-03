import { MAX_IMPERSONATION_MINUTES, type ImpersonationSessionResponse, type StartImpersonationInput } from '@molho/contracts';
import type { Logger } from '@nestjs/common';
import type { EmailProvider } from '../messaging/email-provider.port';
import type { TokenService } from '../auth/token/token.service';
import { ScopeNotFoundError } from './staff-provisioning.errors';
import type { ImpersonationRepository } from './impersonation.repository';

export interface ImpersonationActor {
  id: string;
  role: string;
}

/**
 * "O recurso mais perigoso da plataforma" (docs/01 §5-C.1): emite um token
 * de vida curta (`TokenService.issueImpersonationToken`, sem refresh),
 * grava em `audit_log` ANTES de tentar notificar (a auditoria não pode
 * depender do e-mail sair), e só então tenta avisar o dono da loja — best-
 * effort, nunca bloqueia a sessão por falha de e-mail (senão vira negação
 * de serviço do próprio suporte). `sub` do token é sempre o ATOR REAL — ver
 * `ImpersonationClaim` em token-payload.ts pra por que isso já resolve "toda
 * escrita fica marcada com o ator real" de graça.
 */
export class ImpersonationService {
  constructor(
    private readonly repo: ImpersonationRepository,
    private readonly tokenService: TokenService,
    private readonly emailProvider: EmailProvider,
    private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  async start(
    tenantId: string,
    input: StartImpersonationInput,
    actor: ImpersonationActor,
  ): Promise<ImpersonationSessionResponse> {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new ScopeNotFoundError('tenant', tenantId);

    const ttlSeconds = MAX_IMPERSONATION_MINUTES * 60;
    const { accessToken, expiresAt } = await this.tokenService.issueImpersonationToken(actor.id, tenantId, {
      readOnly: input.readOnly,
      ttlSeconds,
    });

    await this.repo.recordAuditLog({
      tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      reason: input.reason,
      readOnly: input.readOnly,
      expiresAt,
    });

    await this.notifyOwner(tenant.name, tenantId, input, expiresAt);

    return {
      accessToken,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      readOnly: input.readOnly,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async notifyOwner(
    tenantName: string,
    tenantId: string,
    input: StartImpersonationInput,
    expiresAt: Date,
  ): Promise<void> {
    try {
      const ownerEmail = await this.repo.findOwnerEmail(tenantId);
      if (!ownerEmail) return;
      const modo = input.readOnly ? 'somente leitura' : 'leitura e escrita';
      await this.emailProvider.send(
        ownerEmail,
        `O suporte Molho acessou o painel da ${tenantName}`,
        `Alguém do suporte Molho entrou no painel da sua loja (${modo}) até ${expiresAt.toLocaleString('pt-BR')}.\n` +
          `Motivo informado: ${input.reason}\n\n` +
          `Se você não esperava esse acesso, responda este e-mail.`,
      );
    } catch (error) {
      // Best-effort: e-mail de aviso NUNCA derruba a sessão de impersonation
      // já concedida e já auditada — só fica sem notificação, registrado aqui.
      this.logger.warn(
        `Falha ao notificar dono da loja ${tenantId} sobre impersonation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
