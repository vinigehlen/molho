import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  createCustomerProfileAddressSchema,
  type CreateCustomerProfileAddressInput,
  updateCustomerProfileAddressSchema,
  type UpdateCustomerProfileAddressInput,
  updateCustomerProfileSchema,
  type UpdateCustomerProfileInput,
} from '@molho/contracts';
import { CustomerJwtAuthGuard, type RequestWithCustomer } from '../auth/guards/customer-jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CustomerProfileConflictError, CustomerProfileNotFoundError } from './customer-profile.errors';
import type { CustomerProfileService } from './customer-profile.service';
import { CUSTOMER_PROFILE_SERVICE } from './customer-profile.tokens';
import { ZodValidationPipe } from './zod-validation.pipe';

@Controller('v1/store/:slug/me')
@UseGuards(CustomerJwtAuthGuard, RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('customers')
export class CustomerProfileController {
  constructor(@Inject(CUSTOMER_PROFILE_SERVICE) private readonly profile: CustomerProfileService) {}

  @Get()
  getProfile(@Req() request: RequestWithCustomer) {
    return this.handle(() => this.profile.getProfile(request.user.sub));
  }

  @Patch()
  updateProfile(
    @Req() request: RequestWithCustomer,
    @Body(new ZodValidationPipe(updateCustomerProfileSchema)) body: UpdateCustomerProfileInput,
  ) {
    return this.handle(() => this.profile.updateProfile(request.user.sub, body));
  }

  @Get('addresses')
  listAddresses(@Req() request: RequestWithCustomer) {
    return this.handle(() => this.profile.listAddresses(request.user.sub));
  }

  @Post('addresses')
  createAddress(
    @Req() request: RequestWithCustomer,
    @Body(new ZodValidationPipe(createCustomerProfileAddressSchema)) body: CreateCustomerProfileAddressInput,
  ) {
    return this.handle(() => this.profile.createAddress(request.user.sub, body));
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @Req() request: RequestWithCustomer,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(updateCustomerProfileAddressSchema)) body: UpdateCustomerProfileAddressInput,
  ) {
    return this.handle(() => this.profile.updateAddress(request.user.sub, addressId, body));
  }

  @Delete('addresses/:addressId')
  @HttpCode(204)
  deleteAddress(
    @Req() request: RequestWithCustomer,
    @Param('addressId') addressId: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.handle(() => this.profile.deleteAddress(request.user.sub, addressId, version));
  }

  @Get('orders')
  listOrders(@Req() request: RequestWithCustomer) {
    return this.handle(() => this.profile.listOrders(request.user.sub));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CustomerProfileNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof CustomerProfileConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

