import { BadRequestException, ConflictException, type HttpException, NotFoundException } from '@nestjs/common';
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
  PaymentNotConfirmedError,
} from './order-errors';

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
  throw error;
}
