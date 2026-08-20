import { z } from 'zod';

export const signupRequestOtpSchema = z.object({
  email: z.string().trim().min(3).max(254),
});
export type SignupRequestOtpInput = z.infer<typeof signupRequestOtpSchema>;

export const signupVerifySchema = z.object({
  email: z.string().trim().min(3).max(254),
  code: z.string().regex(/^\d{6}$/, 'Código precisa ter 6 dígitos.'),
  restaurantName: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(80),
});
export type SignupVerifyInput = z.infer<typeof signupVerifySchema>;

export const signupVerifyResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({ id: z.uuid(), name: z.string() }),
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  store: z.object({ id: z.uuid(), name: z.string() }),
  created: z.boolean(),
});
export type SignupVerifyResponse = z.infer<typeof signupVerifyResponseSchema>;
