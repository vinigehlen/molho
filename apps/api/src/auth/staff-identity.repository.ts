import { type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { encryptPhone, hashPhoneForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface Identity {
  id: string;
  name: string;
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

  async findOrCreate(phone: PhoneNumber): Promise<{ identity: Identity; created: boolean }> {
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
