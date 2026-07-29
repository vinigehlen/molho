import { Injectable, Logger } from '@nestjs/common';
import type { EmailAddress } from '@molho/contracts';
import type { EmailProvider } from './email-provider.port';

interface SentEmail {
  to: EmailAddress;
  subject: string;
  text: string;
  at: Date;
}

/** Dev/teste: não manda nada de verdade, só loga e guarda em memória. */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);
  private readonly sent: SentEmail[] = [];

  async send(to: EmailAddress, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text, at: new Date() });
    this.logger.log(`[mock] e-mail pra ${to} — ${subject}: ${text}`);
  }

  /** Só pra teste/inspeção — nunca usado em request path de verdade. */
  getSentEmails(): readonly SentEmail[] {
    return this.sent;
  }
}
