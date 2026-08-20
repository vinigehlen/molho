import type {
  CreateCustomerProfileAddressInput,
  CustomerOrderSummary,
  CustomerProfile,
  CustomerProfileAddress,
  UpdateCustomerProfileAddressInput,
  UpdateCustomerProfileInput,
} from '@molho/contracts';
import { decryptEmail, decryptPhone } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { CustomerProfileConflictError, CustomerProfileNotFoundError } from './customer-profile.errors';

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const local = digits.slice(-11);
  if (local.length !== 11) return `••••${digits.slice(-4)}`;
  return `(${local.slice(0, 2)}) *****-${local.slice(-4)}`;
}

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!local || !domain) return '••••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(Math.max(local.length - 1, 3), 8))}@${domain}`;
}

function addressKey(address: {
  street: string;
  number: string | null;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string | null;
}): string {
  return [
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.postalCode,
  ]
    .map((value) => value?.trim().toLocaleLowerCase('pt-BR') ?? '')
    .join('|');
}

export class CustomerProfileService {
  constructor(private readonly requestContext: RequestContextService) {}

  async getProfile(customerId: string): Promise<CustomerProfile> {
    const customer = await this.findCustomer(customerId);
    if (!customer.phoneCiphertext) {
      throw new CustomerProfileNotFoundError('Perfil não encontrado nesta loja.');
    }
    return {
      id: customer.id,
      name: customer.name,
      phoneMasked: customer.phoneCiphertext
        ? maskPhone(decryptPhone(Buffer.from(customer.phoneCiphertext), customer.phoneKeyVersion))
        : null,
      emailMasked: customer.emailCiphertext
        ? maskEmail(decryptEmail(Buffer.from(customer.emailCiphertext), customer.emailKeyVersion))
        : null,
      phoneVerified: customer.phoneVerifiedAt !== null,
      version: customer.version,
    };
  }

  async updateProfile(customerId: string, input: UpdateCustomerProfileInput): Promise<CustomerProfile> {
    await this.findCustomer(customerId);
    const result = await this.requestContext.getClient().customer.updateMany({
      where: { id: customerId, version: input.version, deletedAt: null },
      data: { name: input.name, version: { increment: 1 } },
    });
    if (result.count === 0) throw new CustomerProfileConflictError('Seu perfil mudou em outra sessão. Atualize e tente de novo.');
    return this.getProfile(customerId);
  }

  async listAddresses(customerId: string): Promise<CustomerProfileAddress[]> {
    await this.findCustomer(customerId);
    const rows = await this.requestContext.getClient().address.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        label: true,
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        postalCode: true,
        referencePoint: true,
        version: true,
        updatedAt: true,
      },
    });

    const seen = new Set<string>();
    return rows
      .filter((row) => {
        const key = addressKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  }

  async createAddress(customerId: string, input: CreateCustomerProfileAddressInput): Promise<CustomerProfileAddress> {
    const customer = await this.findCustomer(customerId);
    const row = await this.requestContext.getClient().address.create({
      data: { tenantId: customer.tenantId, customerId, ...input },
      select: {
        id: true,
        label: true,
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        postalCode: true,
        referencePoint: true,
        version: true,
        updatedAt: true,
      },
    });
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    input: UpdateCustomerProfileAddressInput,
  ): Promise<CustomerProfileAddress> {
    await this.findCustomer(customerId);
    const { version, ...data } = input;
    const result = await this.requestContext.getClient().address.updateMany({
      where: { id: addressId, customerId, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) throw new CustomerProfileConflictError('Esse endereço mudou ou não está mais disponível.');
    const row = await this.requestContext.getClient().address.findFirst({
      where: { id: addressId, customerId, deletedAt: null },
      select: {
        id: true,
        label: true,
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        postalCode: true,
        referencePoint: true,
        version: true,
        updatedAt: true,
      },
    });
    if (!row) throw new CustomerProfileNotFoundError('Endereço não encontrado.');
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }

  async deleteAddress(customerId: string, addressId: string, version: number): Promise<void> {
    await this.findCustomer(customerId);
    const result = await this.requestContext.getClient().address.updateMany({
      where: { id: addressId, customerId, version, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) throw new CustomerProfileConflictError('Esse endereço mudou ou já foi excluído.');
  }

  async listOrders(customerId: string): Promise<CustomerOrderSummary[]> {
    await this.findCustomer(customerId);
    const rows = await this.requestContext.getClient().order.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        fulfillmentType: true,
        totalCents: true,
        createdAt: true,
        items: { select: { name: true, quantity: true } },
      },
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  private async findCustomer(customerId: string) {
    const customer = await this.requestContext.getClient().customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phoneCiphertext: true,
        phoneKeyVersion: true,
        emailCiphertext: true,
        emailKeyVersion: true,
        phoneVerifiedAt: true,
        version: true,
      },
    });
    if (!customer) throw new CustomerProfileNotFoundError('Perfil não encontrado nesta loja.');
    return customer;
  }
}
