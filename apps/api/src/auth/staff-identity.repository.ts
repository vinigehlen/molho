import { type EmailAddress, type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { encryptEmail, encryptPhone, hashEmailForLookup, hashPhoneForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface Identity {
  id: string;
  name: string;
}

/** P2002 = violação de índice único no Prisma. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/**
 * users é identidade GLOBAL (sem tenant_id) — ver CLAUDE.md "Duas semânticas
 * de identidade". Primeiro login por OTP cria um User SEM nenhum
 * user_role — nenhum papel é atribuído automaticamente (menor privilégio
 * por padrão; convite/elevação de papel é ação explícita de um owner,
 * não decisão deste endpoint). Ver nota de escalonamento no relatório do
 * Épico 3: o desenho original pedia "cria user + user_role", mas atribuir
 * QUALQUER papel automaticamente é decisão de segurança que não me cabe
 * tomar sozinho.
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
  async findOrCreateByEmail(email: EmailAddress): Promise<{ identity: Identity; created: boolean }> {
    const client = this.requestContext.getClient();
    const emailHash = hashEmailForLookup(email);

    const existing = await client.user.findFirst({
      where: { emailLookupHash: emailHash, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { identity: existing, created: false };

    const { ciphertext, keyVersion } = encryptEmail(email);
    try {
      const created = await client.user.create({
        data: {
          // Mesmo placeholder do fluxo por telefone — o OTP não coleta nome.
          name: 'Novo usuário',
          emailCiphertext: new Uint8Array(ciphertext),
          emailLookupHash: emailHash,
          emailKeyVersion: keyVersion,
        },
        select: { id: true, name: true },
      });
      return { identity: created, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await client.user.findFirst({
        where: { emailLookupHash: emailHash, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!raced) throw error;
      return { identity: raced, created: false };
    }
  }

  /**
   * Caminho por SMS — PRESERVADO pra rollback de canal (é troca de env, não
   * de código). Um mesmo humano que logou por SMS e depois por e-mail vira
   * DOIS `users`, sem vínculo: merge de identidades é Fase 2, registrado em
   * docs/08. No piloto não coexistem (o canal é fixo por deploy).
   */
  async findOrCreateByPhone(phone: PhoneNumber): Promise<{ identity: Identity; created: boolean }> {
    const client = this.requestContext.getClient();
    const phoneHash = hashPhoneForLookup(phoneNumberToE164(phone));

    const existing = await client.user.findFirst({
      where: { phoneLookupHash: phoneHash, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { identity: existing, created: false };

    const { ciphertext, keyVersion } = encryptPhone(phoneNumberToE164(phone));
    const created = await client.user.create({
      data: {
        // Placeholder — não há campo de nome no fluxo de OTP (só
        // phone+code). Fica pro passo de "completar perfil" de um épico
        // futuro. Não é decisão de segurança, só um placeholder de UX.
        name: 'Novo usuário',
        phoneCiphertext: new Uint8Array(ciphertext),
        phoneLookupHash: phoneHash,
        phoneKeyVersion: keyVersion,
      },
      select: { id: true, name: true },
    });
    return { identity: created, created: true };
  }
}
