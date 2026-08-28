import { z } from 'zod';

export const signupRequestOtpSchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
});
export type SignupRequestOtpInput = z.infer<typeof signupRequestOtpSchema>;

export const signupVerifySchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  code: z.string().regex(/^\d{6}$/, 'Código precisa ter 6 dígitos.'),
  restaurantName: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(80),
});
export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;

export const signupVerifyResponseSchema = z.strictObject({
  accessToken: z.string(),
  user: z.strictObject({ id: z.uuid(), name: z.string() }),
  tenant: z.strictObject({ id: z.uuid(), slug: z.string(), name: z.string() }),
  store: z.strictObject({ id: z.uuid(), name: z.string() }),
  created: z.boolean(),
});
export type SignupVerifyResponse = z.infer<typeof signupVerifyResponseSchema>;

/**
 * Slugify puro (só normaliza, não garante tamanho mínimo nem sufixo de
 * desempate) — compartilhado entre o preview do front (`molho.live/<slug>`
 * ao digitar o nome) e o backend, pra nunca divergir do que vai virar a URL
 * real da loja. `SignupProvisioningService.nextAvailableSlug` (apps/api)
 * ainda cuida do sufixo `-2`/`-3` e do fallback de nome curto na hora de
 * CRIAR a loja — isso é decisão de servidor, não de preview.
 */
export function slugifyStoreName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const signupSlugAvailabilitySchema = z.strictObject({
  available: z.boolean(),
  suggestion: z.string().optional(),
});
export type SignupSlugAvailability = z.infer<typeof signupSlugAvailabilitySchema>;
