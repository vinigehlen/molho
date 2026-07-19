import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogConflictError, CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import { toCatalogHttpException } from './catalog-http.util';

/**
 * Traduz os 3 erros de domínio do catálogo pra HTTP sem repetir try/catch em
 * cada handler dos controllers (create/update/delete x 4 entidades). Só
 * intercepta estes 3 tipos — qualquer outro erro segue pro filtro padrão do
 * Nest (500 com stack preservado).
 */
@Catch(CatalogNotFoundError, CatalogConflictError, CatalogValidationError)
export class CatalogExceptionFilter implements ExceptionFilter {
  catch(error: CatalogNotFoundError | CatalogConflictError | CatalogValidationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = toCatalogHttpException(error);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }
}
