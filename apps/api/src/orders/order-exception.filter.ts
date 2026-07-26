import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  CheckoutCustomerNotFoundError,
  CheckoutStoreNotConfiguredError,
  IllegalOrderTransitionError,
  InvalidChangeAmountError,
  MissingCancelReasonError,
  OrderConflictError,
  OrderNotFoundError,
  PaymentAlreadyConfirmedError,
  PaymentMethodNotAvailableError,
} from './order-errors';
import { toOrderHttpException } from './order-http.util';

type OrderDomainError =
  | OrderNotFoundError
  | OrderConflictError
  | IllegalOrderTransitionError
  | MissingCancelReasonError
  | CheckoutCustomerNotFoundError
  | CheckoutStoreNotConfiguredError
  | PaymentAlreadyConfirmedError
  | PaymentMethodNotAvailableError
  | InvalidChangeAmountError;

/** Traduz os erros de domínio de pedidos/checkout pra HTTP — mesmo padrão de CatalogExceptionFilter. */
@Catch(
  OrderNotFoundError,
  OrderConflictError,
  IllegalOrderTransitionError,
  MissingCancelReasonError,
  CheckoutCustomerNotFoundError,
  CheckoutStoreNotConfiguredError,
  PaymentAlreadyConfirmedError,
  PaymentMethodNotAvailableError,
  InvalidChangeAmountError,
)
export class OrderExceptionFilter implements ExceptionFilter {
  catch(error: OrderDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = toOrderHttpException(error);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }
}
