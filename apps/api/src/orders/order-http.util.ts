import {
  BadRequestException,
  ConflictException,
  type HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

/**
 * Mesma ideia de `toCatalogHttpException`: erro desconhecido relança sem
 * embrulho, pro filtro padrão do Nest tratar como 500 com stack preservado.
 */
export function toOrderHttpException(error: unknown): HttpException {
  if (error instanceof OrderNotFoundError) return new NotFoundException(error.message);
  if (error instanceof OrderConflictError) return new ConflictException(error.message);
  if (error instanceof IllegalOrderTransitionError) return new ConflictException(error.message);
  if (error instanceof MissingCancelReasonError) return new BadRequestException(error.message);
  if (error instanceof CheckoutCustomerNotFoundError) return new NotFoundException(error.message);
  if (error instanceof CheckoutStoreNotConfiguredError) return new ConflictException(error.message);
  if (error instanceof PaymentAlreadyConfirmedError) return new ConflictException(error.message);
  if (error instanceof PaymentNotConfirmedError) return new ConflictException(error.message);
  if (error instanceof PaymentMethodNotAvailableError) return new ConflictException(error.message);
  if (error instanceof InvalidChangeAmountError) return new BadRequestException(error.message);
  if (error instanceof CheckoutOtpRequiredError) return new UnauthorizedException(error.message);
  if (error instanceof GuestCustomerNotAllowedError) return new BadRequestException(error.message);
  if (error instanceof GuestCustomerRequiredError) return new BadRequestException(error.message);
  if (error instanceof FulfillmentAddressMismatchError) return new BadRequestException(error.message);
  if (error instanceof CounterOrderStoreNotFoundError) return new NotFoundException(error.message);
  if (error instanceof CounterOrderProductNotFoundError) return new NotFoundException(error.message);
  if (error instanceof WeighedPriceOutOfRangeError) return new BadRequestException(error.message);
  if (error instanceof MissingIdempotencyKeyError) return new BadRequestException(error.message);
  if (error instanceof OrderNotEditableError) return new ConflictException(error.message);
  if (error instanceof OrderAdjustmentItemNotFoundError) return new NotFoundException(error.message);
  throw error;
}
