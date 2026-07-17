import { type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { encryptPhone, hashPhoneForLookup } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { Identity } from './staff-identity.repository';

/**
 * customers é escopo por tenant_id (RLS normal) — o mesmo telefone em dois
 * tenants é dois registros isolados de propósito. Self-service de verdade:
 * cliente final sempre pôde se auto-cadastrar comprando, diferente de staff.
 */
export class CustomerIdentityRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findOrCreate(tenantId: string, phone: PhoneNumber): Promise<{ identity: Identity; created: boolean }> {
    const client = this.requestContext.getClient();
    const phoneHash = hashPhoneForLookup(phoneNumberToE164(phone));

    const existing = await client.customer.findFirst({
      where: { tenantId, phoneLookupHash: phoneHash, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { identity: existing, created: false };

    const { ciphertext, keyVersion } = encryptPhone(phoneNumberToE164(phone));
    const created = await client.customer.create({
      data: {
        tenantId,
        // Placeholder — mesmo caso de users, sem campo de nome no OTP.
        name: 'Cliente',
        phoneCiphertext: new Uint8Array(ciphertext),
        phoneLookupHash: phoneHash,
        phoneKeyVersion: keyVersion,
      },
      select: { id: true, name: true },
    });
    return { identity: created, created: true };
  }
}
