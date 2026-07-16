import { parsePhoneNumber } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { MockMessagingProvider } from './mock-messaging.provider';

describe('MockMessagingProvider', () => {
  it('não manda nada de verdade — só guarda em memória pra inspeção', async () => {
    const provider = new MockMessagingProvider();
    const phone = parsePhoneNumber('+5551999990000');

    await provider.send(phone, 'seu código é 123456');

    const sent = provider.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(phone);
    expect(sent[0]?.message).toBe('seu código é 123456');
  });
});
