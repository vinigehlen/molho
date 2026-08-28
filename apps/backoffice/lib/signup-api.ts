import { API_URL } from './api-config';

export interface SignupResult {
  accessToken: string;
  user: { id: string; name: string };
  tenant: { id: string; slug: string; name: string };
  store: { id: string; name: string };
  created: boolean;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? fallback;
}

export interface SlugAvailability {
  available: boolean;
  suggestion?: string;
}

export async function checkSlugAvailability(slug: string): Promise<SlugAvailability> {
  const res = await fetch(`${API_URL}/v1/signup/slug-available?slug=${encodeURIComponent(slug)}`).catch(() => null);
  if (!res || !res.ok) return { available: false };
  return (await res.json()) as SlugAvailability;
}

export async function requestSignupOtp(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/signup/request-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => null);
  if (!res) throw new Error('Não foi possível enviar o código. Confira sua conexão.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Não foi possível enviar o código.'));
}

export async function verifySignup(input: {
  email: string;
  code: string;
  restaurantName: string;
  ownerName: string;
}): Promise<SignupResult> {
  const res = await fetch(`${API_URL}/v1/signup/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  }).catch(() => null);
  if (!res) throw new Error('Não foi possível criar sua loja. Confira sua conexão.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Código inválido ou expirado.'));
  return (await res.json()) as SignupResult;
}
