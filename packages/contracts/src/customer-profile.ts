import { z } from 'zod';
import { fulfillmentTypeSchema, paymentStatusSchema } from './checkout';
import { orderStatusSchema } from './admin-order';

const nullableTrimmedText = (max: number) => z.string().trim().max(max).nullable();

export const customerProfileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phoneMasked: z.string().nullable(),
  emailMasked: z.string().nullable(),
  phoneVerified: z.boolean(),
  version: z.int().nonnegative(),
});
export type CustomerProfile = z.infer<typeof customerProfileSchema>;

export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  version: z.int().nonnegative(),
});
export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;

export const customerProfileAddressFieldsSchema = z.object({
  label: z.string().trim().min(1).max(40),
  street: z.string().trim().min(1).max(160),
  number: nullableTrimmedText(20),
  complement: nullableTrimmedText(100),
  neighborhood: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: nullableTrimmedText(9),
  referencePoint: nullableTrimmedText(160),
});

export const customerProfileAddressSchema = customerProfileAddressFieldsSchema.extend({
  id: z.uuid(),
  version: z.int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type CustomerProfileAddress = z.infer<typeof customerProfileAddressSchema>;

export const createCustomerProfileAddressSchema = customerProfileAddressFieldsSchema;
export type CreateCustomerProfileAddressInput = z.infer<typeof createCustomerProfileAddressSchema>;

export const updateCustomerProfileAddressSchema = customerProfileAddressFieldsSchema.extend({
  version: z.int().nonnegative(),
});
export type UpdateCustomerProfileAddressInput = z.infer<typeof updateCustomerProfileAddressSchema>;

export const customerOrderSummarySchema = z.object({
  id: z.uuid(),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentType: fulfillmentTypeSchema,
  totalCents: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.int().positive(),
    }),
  ),
});
export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;

export const customerOrderSummaryListSchema = z.array(customerOrderSummarySchema);
