const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export type OtpRequestResult = { ok: true } | { ok: false; message: string };
export type OtpVerifyResult = { ok: true; accessToken: string; customerId: string } | { ok: false; message: string };

/**
 * Login do cliente por OTP — único ponto do storefront que pede telefone,
 * disparado só do "Fazer pedido" final (CLAUDE.md regra 13). Mensagens de
 * erro em pt-BR prontas pra `MoOtpSheet` exibir direto, sem o chamador
 * precisar traduzir status HTTP.
 */
export async function requestOtp(slug: string, phone: string): Promise<OtpRequestResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
  } catch {
    return { ok: false, message: 'Não deu pra enviar o código agora. Confere sua internet e tenta de novo.' };
  }

  if (response.status === 202) return { ok: true };
  if (response.status === 429) return { ok: false, message: 'Muitos pedidos de código — espera um pouco e tenta de novo.' };
  return { ok: false, message: 'Não deu pra enviar o código agora. Confere o número e tenta de novo.' };
}

export async function verifyOtp(slug: string, phone: string, code: string): Promise<OtpVerifyResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
  } catch {
    return { ok: false, message: 'Não deu pra confirmar o código agora. Confere sua internet e tenta de novo.' };
  }

  if (!response.ok) return { ok: false, message: 'Código inválido ou expirado.' };

  const data: unknown = await response.json().catch(() => null);
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    const user = d.user as Record<string, unknown> | undefined;
    if (typeof d.accessToken === 'string' && user && typeof user.id === 'string') {
      return { ok: true, accessToken: d.accessToken, customerId: user.id };
    }
  }
  return { ok: false, message: 'Resposta inesperada do servidor.' };
}
