import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from './global-exception.filter';

function buildHost(request: { method?: string; originalUrl?: string; url?: string } = {}) {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('GlobalExceptionFilter', () => {
  it('preserva HttpException já mapeada', () => {
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    const reportException = vi.fn();
    const filter = new GlobalExceptionFilter(logger, reportException);
    const { host, response } = buildHost({ method: 'POST', originalUrl: '/v1/teste' });

    filter.catch(new BadRequestException('Payload inválido.'), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Payload inválido.',
      error: 'Bad Request',
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(reportException).not.toHaveBeenCalled();
  });

  it('transforma erro desconhecido em 500 estável e envia para monitoramento', () => {
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    const reportException = vi.fn();
    const filter = new GlobalExceptionFilter(logger, reportException);
    const { host, response } = buildHost({ method: 'GET', originalUrl: '/v1/painel' });
    const error = new Error('detalhe sensível do banco');

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'internal_server_error',
      message: 'Erro interno no servidor.',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'GET /v1/painel falhou com erro não tratado: detalhe sensível do banco',
      error.stack,
    );
    expect(reportException).toHaveBeenCalledWith(error, {
      request: {
        method: 'GET',
        url: '/v1/painel',
      },
    });
  });
});
