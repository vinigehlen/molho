import type { RequestContextService } from '../context/request-context.service';
import type { Weekday } from './store-hours';

export interface StorefrontTenantRecord {
  slug: string;
  name: string;
  themeKey: string;
  timezone: string;
}

export interface StorefrontStoreRecord {
  addressText: string;
  phone: string | null;
  whatsappNumber: string | null;
  minOrderCents: number;
  timezone: string;
  /** Épico 8 (docs/02 §5.5) — pré-requisito de config pra oferecer `pix` no seletor de pagamento. */
  pixKey: string | null;
  pixKeyType: string | null;
  pixMerchantCity: string | null;
}

export interface StorefrontHoursRecord {
  dayOfWeek: Weekday;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface StorefrontModifierRecord {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface StorefrontModifierGroupRecord {
  id: string;
  name: string;
  min: number;
  max: number;
  modifiers: StorefrontModifierRecord[];
}

export interface StorefrontProductRecord {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageKey: string | null;
  /**
   * Galeria (Épico conversão, C1), já em ordem de `position`. Pode vir vazia
   * num produto que nunca migrou pra `ProductImage` — `imageKey` acima
   * continua sendo o fallback de capa nesse caso (StorefrontService resolve).
   */
  images: { imageKey: string }[];
  available: boolean;
  modifierGroups: StorefrontModifierGroupRecord[];
}

export interface StorefrontCategoryRecord {
  id: string;
  name: string;
  products: StorefrontProductRecord[];
}

export interface StorefrontRepository {
  findTenant(): Promise<StorefrontTenantRecord | null>;
  findStore(): Promise<StorefrontStoreRecord | null>;
  listMenu(): Promise<StorefrontCategoryRecord[]>;
  listStoreHours(): Promise<StorefrontHoursRecord[]>;
}

/**
 * Leitura pública do cardápio. Nenhum método recebe `tenantId`: quem chama já
 * está dentro do `RequestContextService.run()` aberto por
 * `TenantContextInterceptor` a partir do slug da URL, e o RLS filtra tudo pelo
 * GUC `app.tenant_id`. É a mesma garantia que protege as rotas de backoffice —
 * a rota ser pública muda quem PODE chamar, não o isolamento entre tenants.
 *
 * O cardápio inteiro sai em UMA query aninhada (decisão do Épico 5). Prisma
 * traduz esse `select` em joins, então não é o problema de N+1 que a forma
 * aninhada sugere.
 */
export class PrismaStorefrontRepository implements StorefrontRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findTenant(): Promise<StorefrontTenantRecord | null> {
    return this.requestContext.getClient().tenant.findFirst({
      where: { deletedAt: null },
      select: { slug: true, name: true, themeKey: true, timezone: true },
    });
  }

  /**
   * Multi-loja é Premium/Fase 3 — no MVP o tenant tem uma loja só, e é dela
   * que saem endereço, telefone e pedido mínimo do cabeçalho. `findFirst`
   * ordenado por `createdAt` mantém a escolha determinística (sempre a loja
   * original) em vez de depender da ordem que o Postgres devolver.
   */
  async findStore(): Promise<StorefrontStoreRecord | null> {
    return this.requestContext.getClient().store.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        addressText: true,
        phone: true,
        whatsappNumber: true,
        minOrderCents: true,
        timezone: true,
        pixKey: true,
        pixKeyType: true,
        pixMerchantCity: true,
      },
    });
  }

  /**
   * Mesma suposição de `findStore()` (uma loja por tenant no MVP) — RLS já
   * escopa por tenant, então não precisa de `storeId` explícito.
   */
  async listStoreHours(): Promise<StorefrontHoursRecord[]> {
    return this.requestContext.getClient().storeHours.findMany({
      where: { deletedAt: null },
      select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
    });
  }

  /**
   * Categoria invisível (`visible: false`) some do cardápio inteira. Produto
   * ESGOTADO (`available: false`) continua aparecendo, de propósito: o cliente
   * precisa ver que o item existe e acabou hoje — sumir com ele parece
   * cardápio menor, e o card esgotado é um padrão explícito do design system
   * (MoProductCard, doc de marca §5.2).
   *
   * Grupos e modificadores saem ordenados por `createdAt` — não existe
   * `sortOrder` neles no schema, e a ordem de criação é a que o lojista
   * montou no backoffice.
   */
  async listMenu(): Promise<StorefrontCategoryRecord[]> {
    return this.requestContext.getClient().category.findMany({
      where: { visible: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        products: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            basePriceCents: true,
            imageKey: true,
            images: {
              where: { deletedAt: null },
              orderBy: { position: 'asc' },
              select: { imageKey: true },
            },
            available: true,
            modifierGroups: {
              // `active: false` (aba Complementos, exceção MVP 2026-08-28) é
              // pausa, não soft-delete — grupo continua existindo (histórico
              // de pedido não quebra), mas nunca aparece pro cliente escolher.
              where: { deletedAt: null, active: true },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                min: true,
                max: true,
                modifiers: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: 'asc' },
                  select: { id: true, name: true, priceDeltaCents: true },
                },
              },
            },
          },
        },
      },
    });
  }
}
