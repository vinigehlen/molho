import { NotFoundException } from '@nestjs/common';
import { type StorefrontPayload, storefrontPayloadSchema } from '@molho/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  StorefrontCategoryRecord,
  StorefrontRepository,
  StorefrontStoreRecord,
  StorefrontTenantRecord,
} from './storefront.repository';
import { StorefrontService } from './storefront.service';

const UUID = '0193f1a0-0000-7000-8000-000000000001';
const PUBLIC_URL = 'https://pub-abc.r2.dev';

class FakeStorefrontRepository implements StorefrontRepository {
  tenant: StorefrontTenantRecord | null = {
    slug: 'hamburgueria-da-vila',
    name: 'Hamburgueria da Vila',
    themeKey: 'brasa',
    timezone: 'America/Sao_Paulo',
  };
  store: StorefrontStoreRecord | null = {
    addressText: 'Rua das Palmeiras, 120',
    phone: '+5511999990000',
    whatsappNumber: '+5511999990000',
    minOrderCents: 2000,
  };
  menu: StorefrontCategoryRecord[] = [];

  async findTenant() {
    return this.tenant;
  }
  async findStore() {
    return this.store;
  }
  async listMenu() {
    return this.menu;
  }
}

function categoria(overrides: Partial<StorefrontCategoryRecord> = {}): StorefrontCategoryRecord {
  return {
    id: UUID,
    name: 'Hambúrgueres',
    products: [
      {
        id: UUID,
        name: 'X-Burger',
        description: 'Pão brioche, blend 180g.',
        basePriceCents: 2890,
        imageKey: 'produtos/x-burger.jpg',
        available: true,
        modifierGroups: [
          {
            id: UUID,
            name: 'Adicionais',
            min: 0,
            max: 2,
            modifiers: [{ id: UUID, name: 'Bacon', priceDeltaCents: 400 }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** `noUncheckedIndexedAccess` está ligado: falhar aqui é melhor que espalhar `!` pelo teste. */
function primeiro<T>(itens: T[], oQue: string): T {
  const item = itens[0];
  if (!item) throw new Error(`esperava pelo menos um ${oQue}, veio lista vazia`);
  return item;
}

/** Atalho pro caminho mais percorrido do payload: primeiro produto da primeira categoria. */
function primeiroProduto(payload: StorefrontPayload) {
  return primeiro(primeiro(payload.categories, 'categoria').products, 'produto');
}

describe('StorefrontService', () => {
  let repository: FakeStorefrontRepository;

  beforeEach(() => {
    repository = new FakeStorefrontRepository();
  });

  it('monta um payload que satisfaz o contrato público', async () => {
    repository.menu = [categoria()];
    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('resolve imageKey em URL pública', async () => {
    repository.menu = [categoria()];
    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    expect(primeiroProduto(payload).imageUrl).toBe('https://pub-abc.r2.dev/produtos/x-burger.jpg');
  });

  it('devolve imageUrl null quando S3_PUBLIC_URL não está configurada, sem quebrar o contrato', async () => {
    repository.menu = [categoria()];
    const payload = await new StorefrontService(repository, undefined).getStorefront();

    expect(primeiroProduto(payload).imageUrl).toBeNull();
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('mantém produto ESGOTADO no cardápio, marcado como indisponível', async () => {
    const c = categoria();
    primeiro(c.products, 'produto').available = false;
    repository.menu = [c];

    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    expect(primeiro(payload.categories, 'categoria').products).toHaveLength(1);
    expect(primeiroProduto(payload).available).toBe(false);
  });

  it('responde 404 quando o tenant sumiu entre a resolução do slug e a leitura', async () => {
    repository.tenant = null;
    await expect(new StorefrontService(repository, PUBLIC_URL).getStorefront()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('responde cardápio mesmo sem loja cadastrada (tenant recém-criado no wizard)', async () => {
    repository.store = null;
    repository.menu = [categoria()];

    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    expect(payload.store.addressText).toBeNull();
    expect(payload.store.phone).toBeNull();
    expect(payload.store.minOrderCents).toBe(0);
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('responde loja sem cardápio nenhum sem quebrar (lojista que ainda não cadastrou nada)', async () => {
    repository.menu = [];
    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    expect(payload.categories).toEqual([]);
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('não vaza campos internos do banco no payload público', async () => {
    repository.menu = [categoria()];
    const payload = await new StorefrontService(repository, PUBLIC_URL).getStorefront();

    const produto = primeiroProduto(payload) as unknown as Record<string, unknown>;
    expect(produto.imageKey).toBeUndefined();
    expect(produto.tenantId).toBeUndefined();
    expect(produto.version).toBeUndefined();
    expect(produto.deletedAt).toBeUndefined();
  });
});
