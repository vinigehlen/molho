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

  /** Placeholder de quando não há nome nenhum a gravar — mesmo caso de `users`, o OTP não tem campo de nome. */
  private static readonly NOME_PLACEHOLDER = 'Cliente';

  /**
   * Busca/cria SEMPRE pelo telefone — inclusive no checkout guest (Épico 9c):
   * um `customer` por telefone por tenant continua sendo a regra, senão
   * "cliente que volta" (o dado que interessa ao lojista) se perderia e o
   * único parcial `(tenant_id, phone_lookup_hash)` seria violado.
   *
   * `verified` é OBRIGATÓRIO de propósito — sem default, nenhum caminho novo
   * carimba procedência por omissão:
   * - `true` (verify do OTP) grava `phone_verified_at` na criação **e** carimba
   *   um registro que já existia sem ele. Isso é upgrade de procedência de um
   *   telefone que passou a ser provado, não identidade nova.
   * - `false` (checkout guest) NUNCA carimba, e nunca APAGA um carimbo
   *   existente: quem já provou o telefone não volta a ser não-verificado por
   *   ter feito um pedido sem logar.
   *
   * `email` (só quando o canal do OTP é e-mail) e `name` seguem a mesma regra
   * do TOFU: gravados apenas quando ainda não há valor de verdade. Não
   * sobrescrever e-mail é o que impede contornar o `findBoundEmail`; não
   * sobrescrever nome impede que um pedido guest renomeie o registro de outra
   * pessoa que digitou o mesmo telefone.
   */
  async findOrCreate(
    tenantId: string,
    phone: PhoneNumber,
    options: { email?: EmailAddress; name?: string; verified: boolean },
  ): Promise<{ identity: Identity; created: boolean }> {
    const { email, name, verified } = options;
    const client = this.requestContext.getClient();
    const phoneHash = hashPhoneForLookup(phoneNumberToE164(phone));
    const encryptedEmail = email ? encryptEmail(email) : null;

    const existing = await client.customer.findFirst({
      where: { tenantId, phoneLookupHash: phoneHash, deletedAt: null },
      select: { id: true, name: true, emailCiphertext: true, phoneVerifiedAt: true },
    });
    if (existing) {
      const semNomeDeVerdade = existing.name.trim() === '' || existing.name === CustomerIdentityRepository.NOME_PLACEHOLDER;
      const dados = {
        ...(encryptedEmail && !existing.emailCiphertext
          ? {
              emailCiphertext: new Uint8Array(encryptedEmail.ciphertext),
              emailKeyVersion: encryptedEmail.keyVersion,
            }
          : {}),
        ...(name && semNomeDeVerdade ? { name } : {}),
        ...(verified && existing.phoneVerifiedAt === null ? { phoneVerifiedAt: new Date() } : {}),
      };
      if (Object.keys(dados).length > 0) {
        const atualizado = await client.customer.update({
          where: { id: existing.id },
          data: dados,
          select: { id: true, name: true },
        });
        return { identity: atualizado, created: false };
      }
      return { identity: { id: existing.id, name: existing.name }, created: false };
    }

    const { ciphertext, keyVersion } = encryptPhone(phoneNumberToE164(phone));
    const created = await client.customer.create({
      data: {
        tenantId,
        name: name ?? CustomerIdentityRepository.NOME_PLACEHOLDER,
        phoneCiphertext: new Uint8Array(ciphertext),
        phoneLookupHash: phoneHash,
        phoneKeyVersion: keyVersion,
        ...(verified ? { phoneVerifiedAt: new Date() } : {}),
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
