import { describe, expect, it } from 'vitest';
import { startImpersonationSchema } from './platform-impersonation';

describe('startImpersonationSchema', () => {
  it('aceita motivo com 10+ caracteres, readOnly default true', () => {
    const parsed = startImpersonationSchema.parse({ reason: 'Investigar bug relatado pelo lojista.' });
    expect(parsed.readOnly).toBe(true);
  });

  it('rejeita motivo vazio', () => {
    expect(startImpersonationSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejeita motivo curto demais (<10 caracteres)', () => {
    expect(startImpersonationSchema.safeParse({ reason: 'bug' }).success).toBe(false);
  });

  it('aceita readOnly=true com motivo curto (10-29 chars)', () => {
    expect(
      startImpersonationSchema.safeParse({ reason: 'Ver o pedido 123.', readOnly: true }).success,
    ).toBe(true);
  });

  it('rejeita readOnly=false com motivo curto (<30 chars) — escrita exige mais justificativa', () => {
    expect(
      startImpersonationSchema.safeParse({ reason: 'Corrigir pedido errado.', readOnly: false }).success,
    ).toBe(false);
  });

  it('aceita readOnly=false com motivo detalhado (30+ chars)', () => {
    expect(
      startImpersonationSchema.safeParse({
        reason: 'Corrigir endereço de entrega errado a pedido do lojista via WhatsApp.',
        readOnly: false,
      }).success,
    ).toBe(true);
  });

  it('rejeita motivo maior que 500 caracteres', () => {
    expect(startImpersonationSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
});
