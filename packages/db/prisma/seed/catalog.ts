/**
 * Cardápio seed do Épico 4 (débito registrado no fechamento do Épico 2: o
 * seed original só cobria tenant + loja + owner + entitlements; catálogo
 * entraria como seed incremental quando as tabelas nascessem). Preço sempre
 * inteiro em centavos (CLAUDE.md regra 4).
 *
 * `imageKey` fica `null` em todo produto de propósito: sem `PEXELS_API_KEY`
 * configurada não há fotos reais pra buscar, e `resolvePublicImageUrl`
 * (apps/api/src/storage/public-url.ts) já degrada `null` pro placeholder do
 * tema — é o "fallback determinístico sem falhar", não uma chave inventada
 * que apontaria pra um objeto inexistente no R2. Fotos reais entram depois.
 */

export interface SeedModifierDef {
  name: string;
  priceDeltaCents: number;
}

export interface SeedModifierGroupDef {
  name: string;
  min: number;
  max: number;
  modifiers: readonly SeedModifierDef[];
}

export interface SeedProductDef {
  name: string;
  description: string | null;
  basePriceCents: number;
  available: boolean;
  modifierGroups?: readonly SeedModifierGroupDef[];
}

export interface SeedCategoryDef {
  name: string;
  products: readonly SeedProductDef[];
}

export interface SeedCatalogDef {
  tenantSlug: string;
  categories: readonly SeedCategoryDef[];
}

export const SEED_CATALOGS: readonly SeedCatalogDef[] = [
  {
    tenantSlug: 'hamburgueria-da-vila',
    categories: [
      {
        name: 'Smash',
        products: [
          {
            name: 'Smash Clássico',
            description: '2 blends de 90g, cheddar, cebola caramelizada, molho da casa',
            basePriceCents: 2800,
            available: true,
          },
          {
            name: 'Smash Duplo',
            description: '3 blends, dobro de queijo, bacon',
            basePriceCents: 3800,
            available: true,
          },
          {
            name: 'Smash Bacon',
            description: 'Bacon crocante e cheddar duplo',
            basePriceCents: 3400,
            available: true,
          },
          {
            name: 'Smash Cebola',
            description: 'Anéis de cebola e barbecue',
            basePriceCents: 3200,
            available: false,
          },
          {
            name: 'Smash Frango',
            description: 'Peito de frango grelhado, cheddar, molho especial',
            basePriceCents: 3000,
            available: true,
          },
        ],
      },
      {
        name: 'Artesanais',
        products: [
          {
            name: 'Burger da Casa',
            description: '180g, queijo prato, alface, tomate, cebola roxa',
            basePriceCents: 3200,
            available: true,
          },
          {
            name: 'Costela BBQ',
            description: '180g de costela desfiada, barbecue, cebola crispy',
            basePriceCents: 4200,
            available: true,
          },
          {
            name: 'Gorgonzola',
            description: '180g, gorgonzola derretido, rúcula, cebola caramelizada',
            basePriceCents: 4000,
            available: true,
          },
          {
            name: 'Cheddar Bacon',
            description: '180g, cheddar cremoso, bacon, picles',
            basePriceCents: 3800,
            available: true,
          },
          {
            name: 'Vegetariano',
            description: 'Hambúrguer de grão-de-bico, queijo, tomate confit',
            basePriceCents: 3000,
            available: true,
          },
          {
            name: 'Kids',
            description: '90g, queijo prato, batata palito',
            basePriceCents: 2200,
            available: true,
          },
          {
            name: 'Angus Especial',
            description: '200g de angus, cheddar inglês, rúcula, cebola crispy',
            basePriceCents: 4400,
            available: true,
          },
        ],
      },
      {
        name: 'Monte seu Burger',
        products: [
          {
            name: 'Monte seu Burger',
            description: 'Monte do seu jeito',
            basePriceCents: 2600,
            available: true,
            modifierGroups: [
              {
                name: 'Pão',
                min: 1,
                max: 1,
                modifiers: [
                  { name: 'Brioche', priceDeltaCents: 0 },
                  { name: 'Australiano', priceDeltaCents: 300 },
                  { name: 'Australiano de Cebola', priceDeltaCents: 300 },
                  { name: 'Integral', priceDeltaCents: 200 },
                ],
              },
              {
                name: 'Ponto da carne',
                min: 1,
                max: 1,
                modifiers: [
                  { name: 'Ao ponto', priceDeltaCents: 0 },
                  { name: 'Bem passado', priceDeltaCents: 0 },
                  { name: 'Mal passado', priceDeltaCents: 0 },
                ],
              },
              {
                name: 'Queijo',
                min: 1,
                max: 1,
                modifiers: [
                  { name: 'Cheddar', priceDeltaCents: 0 },
                  { name: 'Prato', priceDeltaCents: 0 },
                  { name: 'Gorgonzola', priceDeltaCents: 400 },
                  { name: 'Sem queijo', priceDeltaCents: 0 },
                ],
              },
              {
                name: 'Adicionais',
                min: 0,
                max: 5,
                modifiers: [
                  { name: 'Bacon', priceDeltaCents: 500 },
                  { name: 'Ovo', priceDeltaCents: 300 },
                  { name: 'Cebola caramelizada', priceDeltaCents: 300 },
                  { name: 'Cogumelos', priceDeltaCents: 400 },
                  { name: 'Rúcula', priceDeltaCents: 200 },
                  { name: 'Tomate confit', priceDeltaCents: 300 },
                  { name: 'Cebola crispy', priceDeltaCents: 300 },
                  { name: 'Molho especial', priceDeltaCents: 200 },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Acompanhamentos',
        products: [
          {
            name: 'Batata frita P',
            description: null,
            basePriceCents: 1200,
            available: true,
          },
          {
            name: 'Batata frita M',
            description: null,
            basePriceCents: 1500,
            available: true,
          },
          {
            name: 'Batata frita G',
            description: null,
            basePriceCents: 2200,
            available: true,
          },
          {
            name: 'Batata cheddar bacon',
            description: null,
            basePriceCents: 2800,
            available: true,
          },
          {
            name: 'Onion rings',
            description: null,
            basePriceCents: 1800,
            available: true,
          },
          {
            name: 'Nuggets (8un)',
            description: null,
            basePriceCents: 2000,
            available: false,
          },
          {
            name: 'Salada da casa',
            description: null,
            basePriceCents: 1600,
            available: true,
          },
        ],
      },
      {
        name: 'Bebidas',
        products: [
          {
            name: 'Coca-Cola 350ml',
            description: null,
            basePriceCents: 700,
            available: true,
          },
          {
            name: 'Coca-Cola Zero 350ml',
            description: null,
            basePriceCents: 700,
            available: true,
          },
          {
            name: 'Coca-Cola 600ml',
            description: null,
            basePriceCents: 1200,
            available: true,
          },
          {
            name: 'Guaraná Antarctica 350ml',
            description: null,
            basePriceCents: 600,
            available: true,
          },
          {
            name: 'Suco de laranja natural 300ml',
            description: null,
            basePriceCents: 1000,
            available: true,
          },
          {
            name: 'Limonada suíça 400ml',
            description: null,
            basePriceCents: 900,
            available: true,
          },
          {
            name: 'Água mineral 500ml',
            description: null,
            basePriceCents: 500,
            available: true,
          },
          {
            name: 'Água com gás 500ml',
            description: null,
            basePriceCents: 600,
            available: true,
          },
          {
            name: 'Cerveja Heineken 350ml',
            description: null,
            basePriceCents: 1200,
            available: true,
          },
          {
            name: 'Cerveja Original 600ml',
            description: null,
            basePriceCents: 1800,
            available: true,
          },
          {
            name: 'Milkshake de Ovomaltine',
            description: null,
            basePriceCents: 1800,
            available: true,
          },
        ],
      },
      {
        name: 'Sobremesas',
        products: [
          {
            name: 'Petit Gateau',
            description: null,
            basePriceCents: 2200,
            available: true,
          },
          {
            name: 'Brownie com sorvete',
            description: null,
            basePriceCents: 1800,
            available: true,
          },
          {
            name: 'Torta de limão',
            description: null,
            basePriceCents: 1600,
            available: true,
          },
          {
            name: 'Sundae de chocolate',
            description: null,
            basePriceCents: 1400,
            available: false,
          },
        ],
      },
    ],
  },
  {
    tenantSlug: 'pizzaria-roma',
    categories: [
      {
        name: 'Pizzas',
        products: [
          {
            name: 'Margherita',
            description: 'Molho de tomate, mussarela, manjericão',
            basePriceCents: 4500,
            available: true,
          },
          {
            name: 'Calabresa',
            description: 'Molho de tomate, mussarela, calabresa, cebola',
            basePriceCents: 4800,
            available: true,
          },
        ],
      },
    ],
  },
] as const;
