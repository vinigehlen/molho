import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  CheckoutCustomerNotFoundError,
  CheckoutOtpRequiredError,
  CheckoutStoreNotConfiguredError,
  FulfillmentAddressMismatchError,
  GuestCustomerNotAllowedError,
  GuestCustomerRequiredError,
  IllegalOrderTransitionError,
  InvalidChangeAmountError,
  MissingCancelReasonError,
  OrderConflictError,
  OrderNotFoundError,
  PaymentAlreadyConfirmedError,
  PaymentMethodNotAvailableError,
  PaymentNotConfirmedError,
} from './order-errors';
import {
  CounterOrderProductNotFoundError,
  CounterOrderStoreNotFoundError,
  MissingIdempotencyKeyError,
  WeighedPriceOutOfRangeError,
} from './counter-order.errors';
import { OrderAdjustmentItemNotFoundError, OrderNotEditableError } from './order-adjustment.errors';
import { toOrderHttpException } from './order-http.util';

type OrderDomainError =
  | OrderNotFoundError
  | OrderConflictError
  | IllegalOrderTransitionError
  | MissingCancelReasonError
  | CheckoutCustomerNotFoundError
  | CheckoutStoreNotConfiguredError
  | CheckoutOtpRequiredError
  | GuestCustomerNotAllowedError
  | GuestCustomerRequiredError
  | PaymentAlreadyConfirmedError
  | PaymentMethodNotAvailableError
  | PaymentNotConfirmedError
  | InvalidChangeAmountError
  | FulfillmentAddressMismatchError
  | CounterOrderStoreNotFoundError
  | CounterOrderProductNotFoundError
  | WeighedPriceOutOfRangeError
  | MissingIdempotencyKeyError
  | OrderNotEditableError
  | OrderAdjustmentItemNotFoundError;

/** Traduz os erros de domínio de pedidos/checkout pra HTTP — mesmo padrão de CatalogExceptionFilter. */
@Catch(
  OrderNotFoundError,
  OrderConflictError,
  IllegalOrderTransitionError,
  MissingCancelReasonError,
  CheckoutCustomerNotFoundError,
  CheckoutStoreNotConfiguredError,
  CheckoutOtpRequiredError,
  GuestCustomerNotAllowedError,
  GuestCustomerRequiredError,
  PaymentAlreadyConfirmedError,
  PaymentMethodNotAvailableError,
  PaymentNotConfirmedError,
  InvalidChangeAmountError,
  FulfillmentAddressMismatchError,
  CounterOrderStoreNotFoundError,
  CounterOrderProductNotFoundError,
  WeighedPriceOutOfRangeError,
  MissingIdempotencyKeyError,
  OrderNotEditableError,
  OrderAdjustmentItemNotFoundError,
)
export class OrderExceptionFilter implements ExceptionFilter {
  catch(error: OrderDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = toOrderHttpException(error);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }
}
