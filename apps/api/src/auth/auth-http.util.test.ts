import { BadRequestException, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PhoneNumberError } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { SmsQuotaExceededError } from '../messaging/messaging-provider.port';
import { toAuthHttpException } from './auth-http.util';
import { OtpRateLimitedError } from './otp/otp-errors';

describe('toAuthHttpException', () => {
  it('mapeia erros de domínio conhecidos pro HTTP certo', () => {
    expect(toAuthHttpException(new OtpRateLimitedError('cooldown'))?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(toAuthHttpException(new SmsQuotaExceededError(501, 500))).toBeInstanceOf(ServiceUnavailableException);
    expect(toAuthHttpException(new PhoneNumberError('123', 'DDD inválido'))).toBeInstanceOf(BadRequestException);
    const http = new HttpException('já é HTTP', HttpStatus.CONFLICT);
    expect(toAuthHttpException(http)).toBe(http);
  });

  /**
   * O bug que isto existe pra travar: um erro NÃO reconhecido (ex.: o
   * provedor de e-mail/SMS falhando de verdade) devolvendo `undefined` em
   * vez de um `InternalServerErrorException` embrulhado. O embrulho antigo
   * era `instanceof HttpException`, e `GlobalExceptionFilter` só loga/reporta
   * pro Sentry quando NÃO é — a falha real desaparecia sem log nenhum
   * (achado investigando "Não foi possível enviar o código" no login do
   * super-admin: 500 sem NENHUM rastro em log ou Sentry).
   */
  it('erro desconhecido devolve undefined — quem chama repassa o erro ORIGINAL, nunca embrulha em HttpException', () => {
    const original = new Error('Resend respondeu 403: domínio não verificado');
    expect(toAuthHttpException(original)).toBeUndefined();
  });
});
