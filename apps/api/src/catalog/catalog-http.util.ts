import { BadRequestException, ConflictException, type HttpException, NotFoundException } from '@nestjs/common';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';

/**
 * 404/409/400 pros 3 erros de domínio do catálogo. Erro desconhecido não é
 * mapeado aqui — relança sem embrulho, pro filtro de exceção padrão do Nest
 * tratar como 500 preservando o stack original (diferente de
 * toAuthHttpException, que embrulha tudo; aqui não há um caso "esperado"
 * pra generalizar como 500 silencioso).
 */
export function toCatalogHttpException(error: unknown): HttpException {
  if (error instanceof CatalogNotFoundError) return new NotFoundException(error.message);
  if (error instanceof CatalogConflictError) return new ConflictException(error.message);
  if (error instanceof CatalogValidationError) return new BadRequestException(error.message);
  throw error;
}
