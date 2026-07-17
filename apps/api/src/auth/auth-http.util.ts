import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PhoneNumberError } from '@molho/contracts';
import { SmsQuotaExceededError } from '../messaging/messaging-provider.port';
import { OtpRateLimitedError, type OtpRateLimitKind } from './otp/otp-errors';

/** Janela aproximada até a próxima tentativa fazer sentido — informativo pro cliente, não é o TTL exato do Redis. */
export function retryAfterSecondsFor(kind: OtpRateLimitKind): number {
  return kind === 'cooldown' ? 60 : 3600;
}

/**
 * Mapeia os erros de domínio do fluxo de auth pros HTTP status combinados:
 * 429 rate limit, 503 quota de SMS estourada (nunca cai pro Mock em
 * produção — ver CLAUDE.md), 400 telefone/código inválido.
 */
export function toAuthHttpException(error: unknown): HttpException {
  if (error instanceof OtpRateLimitedError) {
    return new HttpException({ error: 'rate_limited', kind: error.kind }, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof SmsQuotaExceededError) {
    return new ServiceUnavailableException(
      'Sistema temporariamente indisponível. Tente novamente em algumas horas.',
    );
  }
  if (error instanceof PhoneNumberError) {
    return new BadRequestException('Telefone inválido.');
  }
  if (error instanceof HttpException) return error;
  return new InternalServerErrorException();
}

export { HttpStatus };
