/**
 * Cardápio seed do Épico 4 (débito registrado no fechamento do Épico 2: o
 * seed original só cobria tenant + loja + owner + entitlements; catálogo
 * entraria como seed incremental quando as tabelas nascessem). Preço sempre
 * inteiro em centavos (CLAUDE.md regra 4).
 *
 * `photoSearchTerm` é o termo (em INGLÊS — acervo da Pexels é maior) usado
 * por `photos.ts` pra buscar uma foto real na Pexels API. Vive ao lado do
 * produto de propósito: derivar o termo do nome em português automaticamente
 * (ex.: "Guaraná Antarctica" → "guarana antarctica") daria resultado ruim ou
 * vazio — quem escolhe o termo é humano, olhando o prato.
 *
 * Sem `PEXELS_API_KEY`/credenciais R2 configuradas, `photos.ts` nunca é
 * chamado e `imageKey` fica `null` — `resolvePublicImageUrl`
 * (apps/api/src/storage/public-url.ts) já degrada isso pro placeholder do
 * tema. Esse fallback continua existindo pra qualquer ambiente sem as
 * credenciais (CI, outro dev sem a chave).
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
  /** Termo de busca em inglês pra foto real na Pexels — ver comentário do arquivo. */
  photoSearchTerm: string;
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
            photoSearchTerm: 'smash burger cheese closeup plate',
          },
          {
            name: 'Smash Duplo',
            description: '3 blends, dobro de queijo, bacon',
            basePriceCents: 3800,
            available: true,
            photoSearchTerm: 'double cheeseburger',
          },
          {
            name: 'Smash Bacon',
            description: 'Bacon crocante e cheddar duplo',
            basePriceCents: 3400,
            available: true,
            photoSearchTerm: 'bacon cheeseburger',
          },
          {
            name: 'Smash Cebola',
            description: 'Anéis de cebola e barbecue',
            basePriceCents: 3200,
            available: false,
            photoSearchTerm: 'barbecue onion burger',
          },
          {
            name: 'Smash Frango',
            description: 'Peito de frango grelhado, cheddar, molho especial',
            basePriceCents: 3000,
            available: true,
            photoSearchTerm: 'grilled chicken burger',
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
            photoSearchTerm: 'classic cheeseburger',
          },
          {
            name: 'Costela BBQ',
            description: '180g de costela desfiada, barbecue, cebola crispy',
            basePriceCents: 4200,
            available: true,
            photoSearchTerm: 'pulled pork burger',
          },
          {
            name: 'Gorgonzola',
            description: '180g, gorgonzola derretido, rúcula, cebola caramelizada',
            basePriceCents: 4000,
            available: true,
            photoSearchTerm: 'blue cheese burger',
          },
          {
            name: 'Cheddar Bacon',
            description: '180g, cheddar cremoso, bacon, picles',
            basePriceCents: 3800,
            available: true,
            photoSearchTerm: 'bacon cheddar burger',
          },
          {
            name: 'Vegetariano',
            description: 'Hambúrguer de grão-de-bico, queijo, tomate confit',
            basePriceCents: 3000,
            available: true,
            photoSearchTerm: 'vegetarian chickpea burger',
          },
          {
            name: 'Kids',
            description: '90g, queijo prato, batata palito',
            basePriceCents: 2200,
            available: true,
            photoSearchTerm: 'mini cheeseburger kids',
          },
          {
            name: 'Angus Especial',
            description: '200g de angus, cheddar inglês, rúcula, cebola crispy',
            basePriceCents: 4400,
            available: true,
            photoSearchTerm: 'angus beef burger',
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
            photoSearchTerm: 'gourmet burger ingredients',
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
            photoSearchTerm: 'french fries small portion',
          },
          {
            name: 'Batata frita M',
            description: null,
            basePriceCents: 1500,
            available: true,
            photoSearchTerm: 'french fries',
          },
          {
            name: 'Batata frita G',
            description: null,
            basePriceCents: 2200,
            available: true,
            photoSearchTerm: 'french fries basket',
          },
          {
            name: 'Batata cheddar bacon',
            description: null,
            basePriceCents: 2800,
            available: true,
            photoSearchTerm: 'loaded fries cheese bacon',
          },
          {
            name: 'Onion rings',
            description: null,
            basePriceCents: 1800,
            available: true,
            photoSearchTerm: 'onion rings',
          },
          {
            name: 'Nuggets (8un)',
            description: null,
            basePriceCents: 2000,
            available: false,
            photoSearchTerm: 'chicken nuggets',
          },
          {
            name: 'Salada da casa',
            description: null,
            basePriceCents: 1600,
            available: true,
            photoSearchTerm: 'fresh garden salad',
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
            photoSearchTerm: 'cola can',
          },
          {
            name: 'Coca-Cola Zero 350ml',
            description: null,
            basePriceCents: 700,
            available: true,
            photoSearchTerm: 'diet cola can',
          },
          {
            name: 'Coca-Cola 600ml',
            description: null,
            basePriceCents: 1200,
            available: true,
            photoSearchTerm: 'soda bottle',
          },
          {
            name: 'Guaraná Antarctica 350ml',
            description: null,
            basePriceCents: 600,
            available: true,
            photoSearchTerm: 'soda can',
          },
          {
            name: 'Suco de laranja natural 300ml',
            description: null,
            basePriceCents: 1000,
            available: true,
            photoSearchTerm: 'orange juice glass',
          },
          {
            name: 'Limonada suíça 400ml',
            description: null,
            basePriceCents: 900,
            available: true,
            photoSearchTerm: 'limeade drink glass',
          },
          {
            name: 'Água mineral 500ml',
            description: null,
            basePriceCents: 500,
            available: true,
            photoSearchTerm: 'water bottle',
          },
          {
            name: 'Água com gás 500ml',
            description: null,
            basePriceCents: 600,
            available: true,
            photoSearchTerm: 'sparkling water bottle',
          },
          {
            name: 'Cerveja Heineken 350ml',
            description: null,
            basePriceCents: 1200,
            available: true,
            photoSearchTerm: 'beer bottle',
          },
          {
            name: 'Cerveja Original 600ml',
            description: null,
            basePriceCents: 1800,
            available: true,
            photoSearchTerm: 'beer bottle large',
          },
          {
            name: 'Milkshake de Ovomaltine',
            description: null,
            basePriceCents: 1800,
            available: true,
            photoSearchTerm: 'chocolate milkshake',
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
            photoSearchTerm: 'chocolate lava cake',
          },
          {
            name: 'Brownie com sorvete',
            description: null,
            basePriceCents: 1800,
            available: true,
            photoSearchTerm: 'brownie ice cream',
          },
          {
            name: 'Torta de limão',
            description: null,
            basePriceCents: 1600,
            available: true,
            photoSearchTerm: 'lemon pie slice',
          },
          {
            name: 'Sundae de chocolate',
            description: null,
            basePriceCents: 1400,
            available: false,
            photoSearchTerm: 'chocolate sundae',
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
            photoSearchTerm: 'margherita pizza',
          },
          {
            name: 'Calabresa',
            description: 'Molho de tomate, mussarela, calabresa, cebola',
            basePriceCents: 4800,
            available: true,
            photoSearchTerm: 'pepperoni pizza',
          },
        ],
      },
    ],
  },
] as const;
