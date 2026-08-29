import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, LoggerService } from '@nestjs/common';
import type { Request, Response } from 'express';
import { captureException } from './sentry';

const INTERNAL_ERROR_RESPONSE = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  error: 'internal_server_error',
  message: 'Erro interno no servidor.',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerService;
  private readonly reportException: (error: unknown, context?: Record<string, unknown>) => void;

  constructor(
    logger: LoggerService = new Logger(GlobalExceptionFilter.name),
    reportException: (error: unknown, context?: Record<string, unknown>) => void = captureException,
  ) {
    this.logger = logger;
    this.reportException = reportException;
  }

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }

    this.logger.error(this.formatLogMessage(error, request), error instanceof Error ? error.stack : undefined);
    this.reportException(error, {
      request: {
        method: request.method ?? 'UNKNOWN_METHOD',
        url: request.originalUrl ?? request.url ?? 'UNKNOWN_URL',
      },
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(INTERNAL_ERROR_RESPONSE);
  }

  private formatLogMessage(error: unknown, request: Request): string {
    const method = request.method ?? 'UNKNOWN_METHOD';
    const url = request.originalUrl ?? request.url ?? 'UNKNOWN_URL';
    const message = error instanceof Error ? error.message : String(error);
    return `${method} ${url} falhou com erro não tratado: ${message}`;
  }
}
