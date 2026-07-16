import { Injectable, Logger } from '@nestjs/common';
import type { PhoneNumber } from '@molho/contracts';
import { phoneNumberToDisplay } from '@molho/contracts';
import type { MessagingProvider } from './messaging-provider.port';

interface SentMessage {
  to: PhoneNumber;
  message: string;
  at: Date;
}

/** Dev/teste: não manda nada de verdade, só loga e guarda em memória. */
@Injectable()
export class MockMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(MockMessagingProvider.name);
  private readonly sent: SentMessage[] = [];

  async send(to: PhoneNumber, message: string): Promise<void> {
    this.sent.push({ to, message, at: new Date() });
    this.logger.log(`[mock] SMS pra ${phoneNumberToDisplay(to)}: ${message}`);
  }

  /** Só pra teste/inspeção — nunca usado em request path de verdade. */
  getSentMessages(): readonly SentMessage[] {
    return this.sent;
  }
}
