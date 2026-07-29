import { describe, expect, it } from 'vitest';
import { isOtpChannelInUse, otpChannelFor } from './otp-channel';

const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;

describe('otpChannelFor', () => {
  it('sem env: sms (comportamento de hoje — virar pra e-mail é ato explícito)', () => {
    expect(otpChannelFor('staff', env({}))).toBe('sms');
    expect(otpChannelFor('customer', env({}))).toBe('sms');
  });

  it('lê cada escopo da SUA env (staff e cliente podem divergir)', () => {
    const vars = env({ OTP_CHANNEL_STAFF: 'email', OTP_CHANNEL_CUSTOMER: 'sms' });
    expect(otpChannelFor('staff', vars)).toBe('email');
    expect(otpChannelFor('customer', vars)).toBe('sms');
  });

  it('valor inválido LANÇA (typo não vira default silencioso)', () => {
    expect(() => otpChannelFor('staff', env({ OTP_CHANNEL_STAFF: 'e-mail' }))).toThrow(/inválido/);
  });
});

describe('isOtpChannelInUse', () => {
  it('canal usado por UM escopo já conta como em uso', () => {
    const vars = env({ OTP_CHANNEL_STAFF: 'email', OTP_CHANNEL_CUSTOMER: 'sms' });
    expect(isOtpChannelInUse('email', vars)).toBe(true);
    expect(isOtpChannelInUse('sms', vars)).toBe(true);
  });

  it('canal que nenhum escopo usa não está em uso (não pode bloquear o boot)', () => {
    const vars = env({ OTP_CHANNEL_STAFF: 'email', OTP_CHANNEL_CUSTOMER: 'email' });
    expect(isOtpChannelInUse('sms', vars)).toBe(false);
  });
});
