import { type EmailAddress, type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { decryptEmail, encryptEmail, encryptPhone, hashPhoneForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { Identity } from './staff-identity.repository';

/**
 * customers é escopo por tenant_id (RLS normal) — o mesmo telefone em dois
 * tenants é dois registros isolados de propósito. Self-service de verdade:
 * cliente final sempre pôde se auto-cadastrar comprando, diferente de staff.
 *
 * IDENTIDADE É O TELEFONE, sempre — inclusive no piloto com OTP por e-mail
 * (Épico 9c). O e-mail aqui é SÓ canal de entrega: não existe lookup hash,
 * nem unique, nem índice por e-mail em `customers`, então nenhuma query
 * consegue chavear cliente por e-mail nem por acidente. Voltar pro SMS ao fim
 * do piloto é trocar env — nada aqui migra.
 */
export class CustomerIdentityRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  /**
   * E-mail JÁ VINCULADO a este telefone, se houver — é o que sustenta o TOFU
   * (trust on first use) na entrega do OTP: existindo vínculo, o código vai
   * pro e-mail DE REGISTRO e o digitado no formulário é IGNORADO. Sem isso,
   * qualquer um digitaria o telefone da vítima + o próprio e-mail, receberia
   * o código e tomaria a conta — com entrega por e-mail o fator verificado
   * passa a ser o e-mail, e o telefone vira auto-declarado. Ver docs/08
   * § riscos aceitos.
   */
  async findBoundEmail(tenantId: string, phone: PhoneNumber): Promise<EmailAddress | null> {
    const client = this.requestContext.getClient();
    const existing = await client.customer.findFirst({
      where: {
        tenantId,
        phoneLookupHash: hashPhoneForLookup(phoneNumberToE164(phone)),
        deletedAt: null,
      },
      select: { emailCiphertext: true, emailKeyVersion: true },
    });
    if (!existing?.emailCiphertext) return null;
    return decryptEmail(Buffer.from(existing.emailCiphertext), existing.emailKeyVersion) as EmailAddress;
  }

  /**
   * Busca/cria SEMPRE pelo telefone. `email` (só quando o canal é e-mail) é
   * gravado apenas se o registro ainda não tiver vínculo — nunca sobrescreve
   * vínculo existente, senão o TOFU do `findBoundEmail` seria contornável.
   */
  async findOrCreate(
    tenantId: string,
    phone: PhoneNumber,
    email?: EmailAddress,
  ): Promise<{ identity: Identity; created: boolean }> {
    const client = this.requestContext.getClient();
    const phoneHash = hashPhoneForLookup(phoneNumberToE164(phone));
    const encryptedEmail = email ? encryptEmail(email) : null;

    const existing = await client.customer.findFirst({
      where: { tenantId, phoneLookupHash: phoneHash, deletedAt: null },
      select: { id: true, name: true, emailCiphertext: true },
    });
    if (existing) {
      if (encryptedEmail && !existing.emailCiphertext) {
        await client.customer.update({
          where: { id: existing.id },
          data: {
            emailCiphertext: new Uint8Array(encryptedEmail.ciphertext),
            emailKeyVersion: encryptedEmail.keyVersion,
          },
        });
      }
      return { identity: { id: existing.id, name: existing.name }, created: false };
    }

    const { ciphertext, keyVersion } = encryptPhone(phoneNumberToE164(phone));
    const created = await client.customer.create({
      data: {
        tenantId,
        // Placeholder — mesmo caso de users, sem campo de nome no OTP.
        name: 'Cliente',
        phoneCiphertext: new Uint8Array(ciphertext),
        phoneLookupHash: phoneHash,
        phoneKeyVersion: keyVersion,
        ...(encryptedEmail
          ? {
              emailCiphertext: new Uint8Array(encryptedEmail.ciphertext),
              emailKeyVersion: encryptedEmail.keyVersion,
            }
          : {}),
      },
      select: { id: true, name: true },
    });
    return { identity: created, created: true };
  }
}
