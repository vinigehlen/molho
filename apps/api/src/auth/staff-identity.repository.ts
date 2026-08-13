import { type EmailAddress, type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { hashEmailForLookup, hashPhoneForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface Identity {
  id: string;
  name: string;
}

/**
 * users é identidade GLOBAL (sem tenant_id) — ver CLAUDE.md "Duas semânticas
 * de identidade". O verify de OTP NUNCA cria User nem user_role — staff só
 * existe aqui depois de um fluxo de convite/bootstrap (fatias 2/3, fora
 * deste escopo). Achar ninguém, ou achar alguém sem papel, é rejeitado pelo
 * controller com a mesma resposta genérica de código inválido — ver
 * staff-auth.controller.ts.
 */
export class StaffIdentityRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  /**
   * Chave de identidade de staff no piloto (Épico 9c). Nasce SEM telefone —
   * as colunas de telefone são nullable desde a migration deste passo.
   *
   * `email` já vem normalizado por `parseEmail` (trim+lowercase), então duas
   * grafias do mesmo endereço batem no MESMO hash e caem no MESMO registro.
   * Dois requests simultâneos do mesmo e-mail correm pro `create`: o índice
   * único parcial `users_active_email_hash` rejeita o perdedor (P2002), e a
   * resposta certa é re-buscar — é a mesma pessoa, não um erro de verdade.
   */
  async findByEmail(email: EmailAddress): Promise<Identity | null> {
    const client = this.requestContext.getClient();
    return client.user.findFirst({
      where: { emailLookupHash: hashEmailForLookup(email), deletedAt: null },
      select: { id: true, name: true },
    });
  }

  /**
   * Caminho por SMS — PRESERVADO pra rollback de canal (é troca de env, não
   * de código). Um mesmo humano que logou por SMS e depois por e-mail vira
   * DOIS `users`, sem vínculo: merge de identidades é Fase 2, registrado em
   * docs/08. No piloto não coexistem (o canal é fixo por deploy).
   */
  async findByPhone(phone: PhoneNumber): Promise<Identity | null> {
    const client = this.requestContext.getClient();
    return client.user.findFirst({
      where: { phoneLookupHash: hashPhoneForLookup(phoneNumberToE164(phone)), deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
