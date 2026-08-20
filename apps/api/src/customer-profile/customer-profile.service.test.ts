import { describe, expect, it, vi } from 'vitest';
import { CustomerProfileConflictError } from './customer-profile.errors';
import { CustomerProfileService } from './customer-profile.service';

function setup() {
  const client = {
    customer: { findFirst: vi.fn() },
    address: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    order: { findMany: vi.fn() },
  };
  const requestContext = { getClient: () => client };
  return { client, service: new CustomerProfileService(requestContext as never) };
}

const customer = {
  id: 'customer-1', tenantId: 'tenant-1', name: 'Bia', phoneCiphertext: Buffer.from('x'), phoneKeyVersion: 1,
  emailCiphertext: null, emailKeyVersion: 1, phoneVerifiedAt: new Date(), version: 0,
};

describe('CustomerProfileService', () => {
  it('sempre restringe endereço ao customerId autenticado', async () => {
    const { client, service } = setup();
    client.customer.findFirst.mockResolvedValue(customer);
    client.address.findMany.mockResolvedValue([]);
    await service.listAddresses('customer-1');
    expect(client.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'customer-1', deletedAt: null } }));
    expect(client.address.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'customer-1', deletedAt: null } }));
  });

  it('elimina snapshots duplicados mantendo o endereço mais recente', async () => {
    const { client, service } = setup();
    client.customer.findFirst.mockResolvedValue(customer);
    const base = { label: 'Casa', street: 'Rua A', number: '10', complement: null, neighborhood: 'Centro', city: 'Porto Alegre', state: 'RS', postalCode: '90000-000', referencePoint: null, version: 0 };
    client.address.findMany.mockResolvedValue([
      { ...base, id: 'new', updatedAt: new Date('2026-08-20T12:00:00Z') },
      { ...base, id: 'old', updatedAt: new Date('2026-08-19T12:00:00Z') },
    ]);
    await expect(service.listAddresses('customer-1')).resolves.toEqual([
      expect.objectContaining({ id: 'new', updatedAt: '2026-08-20T12:00:00.000Z' }),
    ]);
  });

  it('retorna conflito quando a versão do endereço mudou', async () => {
    const { client, service } = setup();
    client.customer.findFirst.mockResolvedValue(customer);
    client.address.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteAddress('customer-1', 'address-1', 3)).rejects.toBeInstanceOf(CustomerProfileConflictError);
    expect(client.address.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'address-1', customerId: 'customer-1', version: 3, deletedAt: null },
    }));
  });
});
