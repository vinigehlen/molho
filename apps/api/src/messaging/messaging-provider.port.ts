import type { PhoneNumber } from '@molho/contracts';

/**
 * Envio automático (o sistema manda sozinho) — diferente de
 * ClickToChatProvider (compõe link pra um humano tocar em enviar). OTP usa
 * esta porta; status de pedido usa ClickToChatProvider. Ver CLAUDE.md
 * regra 6. `to` é sempre PhoneNumber, nunca string bruta — impossível
 * chamar um provider com telefone mal-formatado.
 */
export interface MessagingProvider {
  send(to: PhoneNumber, message: string): Promise<void>;
}

/**
 * Guardrail de custo do Zenvia estourou o teto diário. otp.service (Épico 3,
 * próximo commit) captura isto especificamente e NEGA o login com mensagem
 * clara — nunca cai pro MockMessagingProvider em produção (mostraria código
 * falso que ninguém recebe, pior que negar).
 */
export class SmsQuotaExceededError extends Error {
  constructor(
    public readonly count: number,
    public readonly limit: number,
  ) {
    super(`Teto diário de SMS excedido: ${count}/${limit}`);
    this.name = 'SmsQuotaExceededError';
  }
}
