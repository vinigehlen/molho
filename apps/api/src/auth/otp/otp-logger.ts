import { Logger } from '@nestjs/common';

export type OtpLogResult = 'success' | 'rate_limited' | 'quota_exceeded' | 'invalid_code';

export interface OtpLogEntry {
  action: 'otp_request' | 'otp_verify';
  /** HASH do telefone, NUNCA o telefone em claro — LGPD. */
  phoneHash: string;
  ip?: string;
  result: OtpLogResult;
}

/** Log estruturado — é o que sustenta detectar padrão de abuso depois. */
export interface OtpLogger {
  log(entry: OtpLogEntry): void;
}

export class ConsoleOtpLogger implements OtpLogger {
  private readonly logger = new Logger('otp');

  log(entry: OtpLogEntry): void {
    this.logger.log(JSON.stringify(entry));
  }
}
