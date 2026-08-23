import { NotFoundException } from '@nestjs/common';
import { type PaymentMethod, type StorefrontPayload, storefrontPayloadSchema } from '@molho/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutGuestGate } from '../modules/checkout-guest.gate';
import type { AvailablePaymentMethodsResolver, StoreForPaymentMethods } from './available-payment-methods';
import type {
  StorefrontCategoryRecord,
  StorefrontHoursRecord,
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
    timezone: 'America/Sao_Paulo',
    pixKey: '+5511999990000',
    pixKeyType: 'phone',
    pixMerchantCity: 'Sao Paulo',
  };
  menu: StorefrontCategoryRecord[] = [];
  /** Vazio por padrão: service precisa se virar sem nenhum turno cadastrado ainda. */
  hours: StorefrontHoursRecord[] = [];

  async findTenant() {
    return this.tenant;
  }
  async findStore() {
    return this.store;
  }
  async listMenu() {
    return this.menu;
  }
  async listStoreHours() {
    return this.hours;
  }
}

/** Por padrão devolve os 3 métodos (caminho feliz) — testes de disponibilidade sobrescrevem `methods`. */
class FakeAvailablePaymentMethodsResolver implements AvailablePaymentMethodsResolver {
  methods: PaymentMethod[] = ['pix', 'cash_on_delivery', 'card_on_delivery'];
  lastStoreSeen: StoreForPaymentMethods | null | undefined = undefined;

  async list(store: StoreForPaymentMethods | null) {
    this.lastStoreSeen = store;
    return this.methods;
  }
}

/** Sempre PUBLIC_URL e resolver-3-métodos — o teste de `S3_PUBLIC_URL` ausente usa `new StorefrontService()` direto (ver abaixo, `undefined` explícito não passa por um default param). */
function buildService(
  repository: StorefrontRepository,
  resolver: AvailablePaymentMethodsResolver = new FakeAvailablePaymentMethodsResolver(),
  guestGate: CheckoutGuestGate = new FakeCheckoutGuestGate(),
): StorefrontService {
  return new StorefrontService(repository, PUBLIC_URL, resolver, guestGate);
}

/** Módulo `checkout.guest` — desligado por padrão, como todo tenant sem linha em tenant_settings. */
class FakeCheckoutGuestGate implements CheckoutGuestGate {
  constructor(private readonly active = false) {}
  async isActive() {
    return this.active;
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
        images: [],
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
    const payload = await buildService(repository).getStorefront();

    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('resolve imageKey em URL pública', async () => {
    repository.menu = [categoria()];
    const payload = await buildService(repository).getStorefront();

    expect(primeiroProduto(payload).imageUrl).toBe('https://pub-abc.r2.dev/produtos/x-burger.jpg');
  });

  it('devolve imageUrl null quando S3_PUBLIC_URL não está configurada, sem quebrar o contrato', async () => {
    repository.menu = [categoria()];
    // new StorefrontService() direto, não buildService(): default param de publicUrl
    // dispara em cima de `undefined` explícito também — não dá pra "passar undefined
    // de propósito" por uma função com default nesse parâmetro.
    const payload = await new StorefrontService(
      repository,
      undefined,
      new FakeAvailablePaymentMethodsResolver(),
      new FakeCheckoutGuestGate(),
    ).getStorefront();

    expect(primeiroProduto(payload).imageUrl).toBeNull();
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('mantém produto ESGOTADO no cardápio, marcado como indisponível', async () => {
    const c = categoria();
    primeiro(c.products, 'produto').available = false;
    repository.menu = [c];

    const payload = await buildService(repository).getStorefront();

    expect(primeiro(payload.categories, 'categoria').products).toHaveLength(1);
    expect(primeiroProduto(payload).available).toBe(false);
  });

  it('responde 404 quando o tenant sumiu entre a resolução do slug e a leitura', async () => {
    repository.tenant = null;
    await expect(buildService(repository).getStorefront()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('responde cardápio mesmo sem loja cadastrada (tenant recém-criado no wizard)', async () => {
    repository.store = null;
    repository.menu = [categoria()];

    const payload = await buildService(repository).getStorefront();

    expect(payload.store.addressText).toBeNull();
    expect(payload.store.phone).toBeNull();
    expect(payload.store.minOrderCents).toBe(0);
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('responde loja sem cardápio nenhum sem quebrar (lojista que ainda não cadastrou nada)', async () => {
    repository.menu = [];
    const payload = await buildService(repository).getStorefront();

    expect(payload.categories).toEqual([]);
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('sem nenhum turno cadastrado: sempre fechado, sem próxima abertura (não quebra o contrato)', async () => {
    repository.menu = [categoria()];
    // hours já é [] por padrão no fixture.
    const payload = await buildService(repository).getStorefront();

    expect(payload.store.isOpenNow).toBe(false);
    expect(payload.store.nextOpensAt).toBeNull();
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('não vaza campos internos do banco no payload público', async () => {
    repository.menu = [categoria()];
    const payload = await buildService(repository).getStorefront();

    const produto = primeiroProduto(payload) as unknown as Record<string, unknown>;
    expect(produto.imageKey).toBeUndefined();
    expect(produto.tenantId).toBeUndefined();
    expect(produto.version).toBeUndefined();
    expect(produto.deletedAt).toBeUndefined();
  });

  it('não vaza a chave PIX (nem tipo/cidade) no payload público — só availablePaymentMethods sai (Épico 8)', async () => {
    // Fixture já tem pixKey/pixKeyType/pixMerchantCity preenchidos (repository.store
    // default) — exatamente o dado sensível que não pode aparecer cru na resposta.
    repository.menu = [categoria()];
    const payload = await buildService(repository).getStorefront();

    const store = payload.store as unknown as Record<string, unknown>;
    expect(store.pixKey).toBeUndefined();
    expect(store.pixKeyType).toBeUndefined();
    expect(store.pixMerchantCity).toBeUndefined();
    expect(Object.keys(store).some((key) => key.toLowerCase().includes('pix') && key !== 'availablePaymentMethods')).toBe(false);
    expect(payload.store.availablePaymentMethods).toEqual(['pix', 'cash_on_delivery', 'card_on_delivery']);
  });

  describe('availablePaymentMethods (Épico 8)', () => {
    it('repassa a lista que o resolver devolveu', async () => {
      const resolver = new FakeAvailablePaymentMethodsResolver();
      resolver.methods = ['pix'];
      repository.menu = [categoria()];

      const payload = await buildService(repository, resolver).getStorefront();

      expect(payload.store.availablePaymentMethods).toEqual(['pix']);
    });

    it('array vazio (loja sem nenhum método pronto) continua satisfazendo o contrato', async () => {
      const resolver = new FakeAvailablePaymentMethodsResolver();
      resolver.methods = [];
      repository.menu = [categoria()];

      const payload = await buildService(repository, resolver).getStorefront();

      expect(payload.store.availablePaymentMethods).toEqual([]);
      expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
    });

    it('passa a Store (não null) pro resolver quando a loja existe — é o que decide se pix entra na conta', async () => {
      const resolver = new FakeAvailablePaymentMethodsResolver();
      repository.menu = [categoria()];

      await buildService(repository, resolver).getStorefront();

      expect(resolver.lastStoreSeen).toMatchObject({ pixKey: '+5511999990000' });
    });

    it('loja ainda não cadastrada: resolver recebe null, nunca quebra o contrato', async () => {
      const resolver = new FakeAvailablePaymentMethodsResolver();
      repository.store = null;
      repository.menu = [categoria()];

      const payload = await buildService(repository, resolver).getStorefront();

      expect(resolver.lastStoreSeen).toBeNull();
      expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
    });
  });
});

describe('StorefrontService — guestCheckout no payload', () => {
  it('reflete o módulo DESLIGADO: front pede OTP (o default de qualquer tenant)', async () => {
    const repository = new FakeStorefrontRepository();
    const payload = await buildService(repository).getStorefront();

    expect(payload.guestCheckout).toBe(false);
    expect(storefrontPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('reflete o módulo LIGADO: front pode oferecer o checkout sem OTP', async () => {
    const repository = new FakeStorefrontRepository();
    const payload = await buildService(
      repository,
      new FakeAvailablePaymentMethodsResolver(),
      new FakeCheckoutGuestGate(true),
    ).getStorefront();

    expect(payload.guestCheckout).toBe(true);
  });
});
