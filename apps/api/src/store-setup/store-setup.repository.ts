import { parseEmail, parsePhoneNumber, phoneNumberToE164, slugifyStoreName, type StoreSetup, type ThemeKey, type UpdateStoreSetupInput } from '@molho/contracts';
import { decryptEmail, decryptPhone, encryptEmail, encryptPhone, Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { ResolvedAddress } from '../geo/resolve-address';
import { nextAvailableSlug, normalizeSlugForCreation } from '../platform/tenant-slug.util';
import { resolvePublicImageUrl } from '../storage/public-url';
import { StoreSetupNotFoundError, StoreSetupValidationError } from './store-setup.errors';

const SELECT = {
  id: true,
  tenantId: true,
  tenant: { select: { cnpj: true, slug: true, themeKey: true, onboardedAt: true } },
  name: true,
  legalName: true,
  stateRegistration: true,
  publicDescription: true,
  addressText: true,
  postalCode: true,
  street: true,
  number: true,
  neighborhood: true,
  city: true,
  state: true,
  complement: true,
  referencePoint: true,
  phone: true,
  whatsappNumber: true,
  logoImageKey: true,
  coverImageKey: true,
  responsibleCpfCiphertext: true,
  responsibleCpfKeyVersion: true,
  responsiblePhoneCiphertext: true,
  responsiblePhoneKeyVersion: true,
  financeEmailCiphertext: true,
  financeEmailKeyVersion: true,
  minOrderCents: true,
  pixKey: true,
  pixKeyType: true,
  pixMerchantCity: true,
  timezone: true,
} as const;

export interface StoreSetupRepository {
  get(storeId: string, actorId?: string): Promise<StoreSetup>;
  update(
    storeId: string,
    input: UpdateStoreSetupInput,
    actor?: { userId: string; role: string },
    resolvedAddress?: ResolvedAddress | null,
  ): Promise<StoreSetup>;
  updateTheme(storeId: string, themeKey: ThemeKey): Promise<StoreSetup>;
  publish(storeId: string, actorId: string): Promise<StoreSetup>;
}

export class PrismaStoreSetupRepository implements StoreSetupRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async get(storeId: string, actorId?: string): Promise<StoreSetup> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: SELECT,
    });
    if (!store) throw new StoreSetupNotFoundError();
    const ownerName = actorId ? await this.getOwnerName(actorId) : null;
    return toStoreSetup(store, ownerName);
  }

  async update(
    storeId: string,
    input: UpdateStoreSetupInput,
    actor?: { userId: string; role: string },
    resolvedAddress?: ResolvedAddress | null,
  ): Promise<StoreSetup> {
    const store = await this.lockStoreOrThrow(storeId);
    if (actor?.userId && input.ownerName !== undefined) {
      await this.requestContext.getClient().user.updateMany({
        where: { id: actor.userId, deletedAt: null },
        data: { name: blankToNull(input.ownerName) ?? storeNameFallback(input.name) },
      });
    }
    if (input.cnpj !== undefined) {
      await this.requestContext.getClient().tenant.updateMany({
        where: { id: store.tenantId, deletedAt: null },
        data: { cnpj: normalizeCnpj(input.cnpj) },
      });
    }
    // Nome fantasia -> domínio sempre sincronizados (decisão de produto,
    // pré-lançamento: ninguém ainda divulgou link nenhum, então não existe
    // link antigo pra quebrar). Só mexe no slug quando o NOME muda de
    // verdade — resalvar o mesmo nome não pode gerar um -2 por acaso.
    const client = this.requestContext.getClient();
    const currentTenant = await client.tenant.findFirst({
      where: { id: store.tenantId, deletedAt: null },
      select: { name: true },
    });
    const newName = input.name.trim();
    if (currentTenant && newName && currentTenant.name.trim() !== newName) {
      const newSlug = await nextAvailableSlug(client, normalizeSlugForCreation(slugifyStoreName(newName)), store.tenantId);
      await client.tenant.updateMany({
        where: { id: store.tenantId, deletedAt: null },
        data: { name: newName, slug: newSlug },
      });
    }
    const responsibleCpf = encryptOptionalCpf(input.responsibleCpf);
    const responsiblePhone = encryptOptionalPhone(input.responsiblePhone);
    const financeEmail = encryptOptionalEmail(input.financeEmail);
    await this.requestContext.getClient().store.updateMany({
      where: { id: storeId, deletedAt: null },
      data: {
        name: input.name,
        legalName: blankToNull(input.legalName),
        stateRegistration: blankToNull(input.stateRegistration),
        publicDescription: blankToNull(input.publicDescription),
        addressText: input.addressText,
        postalCode: normalizePostalCodeOrNull(input.postalCode),
        street: blankToNull(resolvedAddress?.street ?? input.street),
        number: blankToNull(input.number),
        neighborhood: blankToNull(resolvedAddress?.neighborhood ?? input.neighborhood),
        city: blankToNull(resolvedAddress?.city ?? input.city),
        state: blankToNull(resolvedAddress?.state ?? input.state)?.toUpperCase() ?? null,
        complement: blankToNull(input.complement),
        referencePoint: blankToNull(input.referencePoint),
        phone: blankToNull(input.phone),
        whatsappNumber: blankToNull(input.whatsappNumber),
        logoImageKey: blankToNull(input.logoImageKey),
        coverImageKey: blankToNull(input.coverImageKey),
        responsibleCpfCiphertext: toPrismaBytes(responsibleCpf?.ciphertext ?? null),
        responsibleCpfKeyVersion: responsibleCpf?.keyVersion ?? 1,
        responsiblePhoneCiphertext: toPrismaBytes(responsiblePhone?.ciphertext ?? null),
        responsiblePhoneKeyVersion: responsiblePhone?.keyVersion ?? 1,
        financeEmailCiphertext: toPrismaBytes(financeEmail?.ciphertext ?? null),
        financeEmailKeyVersion: financeEmail?.keyVersion ?? 1,
        minOrderCents: input.minOrderCents,
        pixKey: blankToNull(input.pixKey),
        pixKeyType: input.pixKey ? input.pixKeyType : null,
        pixMerchantCity: input.pixKey ? blankToNull(input.pixMerchantCity) : null,
      },
    });
    await this.updateGeo(storeId, resolvedAddress);
    if (actor) {
      await this.requestContext.getClient().auditLog.create({
        data: {
          tenantId: store.tenantId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'store.setup.update',
          entity: 'store',
          afterJson: {
            storeId,
            fields: Object.keys(input),
            hasResponsibleCpf: Boolean(blankToNull(input.responsibleCpf)),
            hasResponsiblePhone: Boolean(blankToNull(input.responsiblePhone)),
            hasFinanceEmail: Boolean(blankToNull(input.financeEmail)),
          },
        },
      });
    }
    return this.get(storeId, actor?.userId);
  }

  async updateTheme(storeId: string, themeKey: ThemeKey): Promise<StoreSetup> {
    const store = await this.lockStoreOrThrow(storeId);
    await this.requestContext.getClient().tenant.updateMany({
      where: { id: store.tenantId, deletedAt: null },
      data: { themeKey },
    });
    return this.get(storeId);
  }

  /**
   * "Publicar minha loja" (Épico 13, fim do wizard) — idempotente e
   * revalidado no servidor, nunca confia só no checklist client-side:
   * já publicado só devolve o estado atual; passos obrigatórios faltando
   * vira 400, mesma natureza de `StoreSetupValidationError` do PIX acima.
   * Os 5 booleans espelham EXATAMENTE o checklist do wizard
   * (apps/backoffice/.../configuracao/page.tsx) — mudar um lado sem o
   * outro reabre a divergência que este comentário existe pra evitar.
   */
  async publish(storeId: string, actorId: string): Promise<StoreSetup> {
    const store = await this.lockStoreOrThrow(storeId);
    const client = this.requestContext.getClient();

    const tenant = await client.tenant.findFirst({
      where: { id: store.tenantId, deletedAt: null },
      select: { id: true, onboardedAt: true, cnpj: true },
    });
    if (!tenant) throw new StoreSetupNotFoundError();
    if (tenant.onboardedAt) return this.get(storeId, actorId);

    const [storeRow, hasShift, hasZone, hasAvailableProduct] = await Promise.all([
      client.store.findFirst({ where: { id: storeId, deletedAt: null }, select: { name: true, addressText: true, phone: true, whatsappNumber: true, pixKey: true, pixKeyType: true, pixMerchantCity: true } }),
      client.storeHours.findFirst({ where: { storeId, deletedAt: null }, select: { id: true } }),
      client.deliveryZone.findFirst({ where: { storeId, deletedAt: null }, select: { id: true } }),
      client.product.findFirst({ where: { tenantId: store.tenantId, deletedAt: null, available: true }, select: { id: true } }),
    ]);
    if (!storeRow) throw new StoreSetupNotFoundError();

    const checklist = {
      loja: Boolean(storeRow.name && storeRow.addressText && storeRow.phone && storeRow.whatsappNumber && tenant.cnpj),
      horarios: hasShift !== null,
      cardapio: hasAvailableProduct !== null,
      entrega: hasZone !== null,
      pagamento: Boolean(storeRow.pixKey && storeRow.pixKeyType && storeRow.pixMerchantCity),
    };
    if (!Object.values(checklist).every(Boolean)) {
      throw new StoreSetupValidationError('Complete os passos obrigatórios antes de publicar.');
    }

    await client.tenant.updateMany({ where: { id: store.tenantId, deletedAt: null }, data: { onboardedAt: new Date() } });
    return this.get(storeId, actorId);
  }

  private async lockStoreOrThrow(storeId: string): Promise<{ id: string; tenantId: string }> {
    const rows = await this.requestContext.getClient().$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT "id", "tenant_id" AS "tenantId"
      FROM "stores"
      WHERE "id" = ${storeId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new StoreSetupNotFoundError();
    return row;
  }

  private async getOwnerName(actorId: string): Promise<string | null> {
    const user = await this.requestContext.getClient().user.findFirst({
      where: { id: actorId, deletedAt: null },
      select: { name: true },
    });
    return user?.name ?? null;
  }

  private async updateGeo(storeId: string, resolvedAddress: ResolvedAddress | null | undefined): Promise<void> {
    if (!resolvedAddress) return;
    const geo =
      resolvedAddress.lat !== null && resolvedAddress.lng !== null
        ? Prisma.sql`ST_SetSRID(ST_MakePoint(${resolvedAddress.lng}, ${resolvedAddress.lat}), 4326)::geography`
        : Prisma.sql`NULL`;
    await this.requestContext.getClient().$executeRaw`
      UPDATE "stores"
      SET "geo" = ${geo}
      WHERE "id" = ${storeId}::uuid AND "deleted_at" IS NULL
    `;
  }
}

function toStoreSetup(
  store: Omit<
    StoreSetup,
    | 'cnpj'
    | 'ownerName'
    | 'tenantSlug'
    | 'logoImageUrl'
    | 'coverImageUrl'
    | 'responsibleCpf'
    | 'responsiblePhone'
    | 'financeEmail'
    | 'themeKey'
    | 'onboardedAt'
  > & {
    tenant: { cnpj: string | null; slug: string; themeKey: string; onboardedAt: Date | null };
    responsibleCpfCiphertext: Uint8Array | Buffer | null;
    responsibleCpfKeyVersion: number;
    responsiblePhoneCiphertext: Uint8Array | Buffer | null;
    responsiblePhoneKeyVersion: number;
    financeEmailCiphertext: Uint8Array | Buffer | null;
    financeEmailKeyVersion: number;
  },
  ownerName: string | null,
): StoreSetup {
  const {
    tenant,
    responsibleCpfCiphertext,
    responsibleCpfKeyVersion,
    responsiblePhoneCiphertext,
    responsiblePhoneKeyVersion,
    financeEmailCiphertext,
    financeEmailKeyVersion,
    ...publicStore
  } = store;
  return {
    ...publicStore,
    cnpj: tenant.cnpj,
    tenantSlug: tenant.slug,
    ownerName,
    themeKey: tenant.themeKey as StoreSetup['themeKey'],
    onboardedAt: tenant.onboardedAt?.toISOString() ?? null,
    logoImageUrl: publicStore.logoImageKey ? resolvePublicImageUrl(publicStore.logoImageKey, process.env.S3_PUBLIC_URL) : null,
    coverImageUrl: publicStore.coverImageKey ? resolvePublicImageUrl(publicStore.coverImageKey, process.env.S3_PUBLIC_URL) : null,
    responsibleCpf: decryptOptional(responsibleCpfCiphertext, responsibleCpfKeyVersion),
    responsiblePhone: decryptOptional(responsiblePhoneCiphertext, responsiblePhoneKeyVersion),
    financeEmail: decryptOptionalEmail(financeEmailCiphertext, financeEmailKeyVersion),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCnpj(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.replace(/\D/g, '') : null;
}

function normalizePostalCodeOrNull(value: string | null): string | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length > 0 ? digits : null;
}

function storeNameFallback(value: string): string {
  return value.trim() || 'Dono da loja';
}

function encryptOptionalCpf(value: string | null): { ciphertext: Buffer; keyVersion: number } | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length > 0 ? encryptPhone(digits) : null;
}

function encryptOptionalPhone(value: string | null): { ciphertext: Buffer; keyVersion: number } | null {
  const trimmed = blankToNull(value);
  if (!trimmed) return null;
  return encryptPhone(phoneNumberToE164(parsePhoneNumber(trimmed)));
}

function encryptOptionalEmail(value: string | null): { ciphertext: Buffer; keyVersion: number } | null {
  const trimmed = blankToNull(value);
  if (!trimmed) return null;
  return encryptEmail(parseEmail(trimmed));
}

function toPrismaBytes(value: Buffer | null): Uint8Array<ArrayBuffer> | null {
  return value ? Uint8Array.from(value) : null;
}

function decryptOptional(ciphertext: Uint8Array | Buffer | null, keyVersion: number): string | null {
  return ciphertext ? decryptPhone(Buffer.from(ciphertext), keyVersion) : null;
}

function decryptOptionalEmail(ciphertext: Uint8Array | Buffer | null, keyVersion: number): string | null {
  return ciphertext ? decryptEmail(Buffer.from(ciphertext), keyVersion) : null;
}
