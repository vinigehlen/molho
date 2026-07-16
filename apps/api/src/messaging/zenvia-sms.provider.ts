import type { PhoneNumber } from '@molho/contracts';
import { phoneNumberToE164 } from '@molho/contracts';
import type { DailySmsCounter } from './daily-sms-counter';
import { todayKey } from './daily-sms-counter';
import type { MessagingProvider } from './messaging-provider.port';
import { SmsQuotaExceededError } from './messaging-provider.port';

const ZENVIA_SMS_ENDPOINT = 'https://api.zenvia.com/v2/channels/sms/messages';
const DEFAULT_MAX_SMS_PER_DAY = 500;

export interface ZenviaLogger {
  critical(message: string): void;
}

export interface ZenviaSmsProviderDeps {
  apiKey: string;
  counter: DailySmsCounter;
  /** MOLHO_MAX_SMS_PER_DAY — default 500 (dev). Prod configura 5000. */
  maxPerDay?: number;
  /** Seam de teste — nunca bate na Zenvia real sem injetar isto. */
  fetchImpl?: typeof fetch;
  logger?: ZenviaLogger;
}

/**
 * Classe pura, sem decorators do Nest — mesmo padrão de ModuleService em
 * packages/db (deps injetadas via objeto, testável sem framework). A
 * fiação com NestJS (ler env, registrar no DI) fica em messaging.module.ts.
 *
 * Guardrail de custo: cada SMS custa ~R$ 0,15 — sem teto, um atacante que
 * furasse o rate limit do OTP ainda causaria prejuízo financeiro direto.
 * increment-then-check no DailySmsCounter (atômico via Redis INCR); se
 * estourar, loga CRITICAL e lança SEM chamar a Zenvia — otp.service (próximo
 * commit) captura isso e NEGA o login com mensagem clara. Não cai pro
 * MockMessagingProvider: mostrar código falso que ninguém recebe é pior UX
 * que negar e escalar pro suporte.
 */
export class ZenviaSmsProvider implements MessagingProvider {
  private readonly apiKey: string;
  private readonly counter: DailySmsCounter;
  private readonly maxPerDay: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: ZenviaLogger;

  constructor(deps: ZenviaSmsProviderDeps) {
    this.apiKey = deps.apiKey;
    this.counter = deps.counter;
    this.maxPerDay = deps.maxPerDay ?? DEFAULT_MAX_SMS_PER_DAY;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.logger = deps.logger ?? { critical: (msg) => console.error(`CRITICAL: ${msg}`) };
  }

  async send(to: PhoneNumber, message: string): Promise<void> {
    const count = await this.counter.incrementAndGet(todayKey());
    if (count > this.maxPerDay) {
      this.logger.critical(
        `teto diário de SMS excedido (${count}/${this.maxPerDay}) — bloqueando envio, Zenvia não foi chamada`,
      );
      throw new SmsQuotaExceededError(count, this.maxPerDay);
    }

    const response = await this.fetchImpl(ZENVIA_SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-TOKEN': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Molho',
        to: phoneNumberToE164(to),
        contents: [{ type: 'text', text: message }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Zenvia respondeu ${response.status}: ${body}`);
    }
  }
}
