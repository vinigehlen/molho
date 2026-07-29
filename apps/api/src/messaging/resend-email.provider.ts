import type { EmailAddress } from '@molho/contracts';
import type { EmailProvider } from './email-provider.port';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendEmailProviderDeps {
  apiKey: string;
  /** Remetente verificado no Resend — ex.: "Molho <login@send.molho.live>". */
  from: string;
  /** Seam de teste — nunca bate no Resend real sem injetar isto. */
  fetchImpl?: typeof fetch;
}

/**
 * Classe pura, sem decorators do Nest — mesmo padrão do ZenviaSmsProvider
 * (deps por objeto, testável sem framework). A fiação (ler env, registrar no
 * DI) fica em messaging.module.ts.
 *
 * REST via fetch, sem o SDK `resend`: são 15 linhas e uma dependência a menos
 * numa superfície de auth.
 *
 * SEM contador de cota (diferente do SMS): SMS é ~R$ 0,15 POR MENSAGEM, então
 * sem teto um atacante causa prejuízo direto — e-mail é preço FIXO por mês
 * (Resend Pro), então estourar volume não vira conta. O teto de 100/dia do
 * plano free é limite do provedor, não custo nosso: aparece como HTTP de erro
 * aqui, e o plano de go-live é assinar o Pro antes do 1º restaurante real
 * (docs/08).
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: ResendEmailProviderDeps) {
    this.apiKey = deps.apiKey;
    this.from = deps.from;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async send(to: EmailAddress, subject: string, text: string): Promise<void> {
    const response = await this.fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
    });

    if (!response.ok) {
      // Corpo do Resend pode citar o destinatário — não logar aqui (LGPD);
      // quem captura decide. Status + corpo bastam pro diagnóstico.
      const body = await response.text();
      throw new Error(`Resend respondeu ${response.status}: ${body}`);
    }
  }
}
