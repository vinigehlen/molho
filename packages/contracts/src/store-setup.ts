import { z } from 'zod';
import { tryParseEmail } from './email-address';
import { tryParsePhoneNumber } from './phone-number';

export const pixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const optionalCnpjSchema = z
  .string()
  .trim()
  .regex(/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, 'CNPJ inválido.')
  .nullable();
const optionalCpfSchema = z
  .string()
  .trim()
  .regex(/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/, 'CPF inválido.')
  .nullable();
const optionalResponsiblePhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || tryParsePhoneNumber(value) !== null, 'Telefone do responsável inválido.')
  .transform((value) => (value === '' ? null : value))
  .nullable();
const optionalFinanceEmailSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || tryParseEmail(value) !== null, 'E-mail financeiro inválido.')
  .transform((value) => (value === '' ? null : value))
  .nullable();

/** Espelha `ThemeKey` de `@molho/ui/themes.ts` (docs/03-self-setup.md §5) —
 * contracts não depende de ui, então os 3 valores vivem duplicados aqui,
 * mesmo padrão de `pixKeyTypeSchema` acima. */
export const themeKeySchema = z.enum(['brasa', 'folha', 'grafite']);
export type ThemeKey = z.infer<typeof themeKeySchema>;

export const storeSetupSchema = z.strictObject({
  id: z.uuid(),
  tenantId: z.uuid(),
  /** Slug ATUAL do tenant (= domínio, `molho.live/<slug>`) — sincronizado
   * com `name` a cada save (decisão de produto pré-lançamento: nome fantasia
   * e domínio nunca divergem). Front usa pra atualizar a sessão local sem
   * precisar de novo login. */
  tenantSlug: z.string(),
  cnpj: z.string().nullable(),
  ownerName: z.string().nullable(),
  name: z.string(),
  legalName: z.string().nullable(),
  stateRegistration: z.string().nullable(),
  publicDescription: z.string().nullable(),
  addressText: z.string(),
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  complement: z.string().nullable(),
  referencePoint: z.string().nullable(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  logoImageKey: z.string().nullable(),
  logoImageUrl: z.string().nullable(),
  coverImageKey: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  responsibleCpf: z.string().nullable(),
  responsiblePhone: z.string().nullable(),
  financeEmail: z.string().nullable(),
  minOrderCents: z.int().nonnegative(),
  pixKey: z.string().nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixMerchantCity: z.string().nullable(),
  timezone: z.string(),
  themeKey: themeKeySchema,
  /** `null` até o lojista apertar "Publicar minha loja" no wizard (Épico 13). */
  onboardedAt: z.iso.datetime().nullable(),
});

export const updateThemeSchema = z.strictObject({ themeKey: themeKeySchema });
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

export const updateStoreSetupSchema = z.strictObject({
  cnpj: optionalCnpjSchema.optional(),
  ownerName: z.string().trim().min(2).max(120).nullable().optional(),
  name: z.string().trim().min(2).max(80),
  legalName: nullableText(120),
  stateRegistration: nullableText(40),
  publicDescription: nullableText(280),
  addressText: z.string().trim().min(5).max(240),
  postalCode: z.string().trim().max(16).nullable(),
  street: nullableText(120),
  number: nullableText(20),
  neighborhood: nullableText(80),
  city: nullableText(80),
  state: z.string().trim().max(2).nullable(),
  complement: nullableText(120),
  referencePoint: nullableText(160),
  phone: z.string().trim().max(32).nullable(),
  whatsappNumber: z.string().trim().max(32).nullable(),
  logoImageKey: nullableText(240),
  coverImageKey: nullableText(240),
  responsibleCpf: optionalCpfSchema,
  responsiblePhone: optionalResponsiblePhoneSchema,
  financeEmail: optionalFinanceEmailSchema,
  minOrderCents: z.int().nonnegative(),
  pixKey: z.string().trim().max(120).nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixMerchantCity: z.string().trim().min(1).max(15).nullable(),
});

export const storeBrandUploadUrlSchema = z.strictObject({
  kind: z.enum(['logo', 'cover']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentLength: z.int().positive().max(5 * 1024 * 1024),
});

export const storeBrandUploadUrlResponseSchema = z.strictObject({
  uploadUrl: z.string(),
  key: z.string(),
  expiresAt: z.iso.datetime(),
});

export type StoreSetup = z.infer<typeof storeSetupSchema>;
export type UpdateStoreSetupInput = z.infer<typeof updateStoreSetupSchema>;
export type StoreBrandUploadUrlInput = z.infer<typeof storeBrandUploadUrlSchema>;
export type StoreBrandUploadUrlResponse = z.infer<typeof storeBrandUploadUrlResponseSchema>;
