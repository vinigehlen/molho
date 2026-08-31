/**
 * Tokens isolados num arquivo próprio, sem import nenhum: catalog.module.ts
 * declara os controllers E os providers desses tokens, enquanto os
 * controllers precisam importar os tokens — colocá-los dentro de
 * catalog.module.ts criava um ciclo controller → module → controller que o
 * Nest resolve com `?` no lugar da dependência em vez de erro claro (achado
 * rodando `nest start` de verdade: "Nest encountered an undefined
 * dependency... may be due to a circular import").
 */
export const CATEGORY_SERVICE = Symbol('CATEGORY_SERVICE');
export const PRODUCT_SERVICE = Symbol('PRODUCT_SERVICE');
export const PRODUCT_OFFER_SERVICE = Symbol('PRODUCT_OFFER_SERVICE');
export const MODIFIER_GROUP_SERVICE = Symbol('MODIFIER_GROUP_SERVICE');
export const MODIFIER_SERVICE = Symbol('MODIFIER_SERVICE');
export const PRODUCT_IMAGE_SERVICE = Symbol('PRODUCT_IMAGE_SERVICE');
export const COMBO_ITEM_SERVICE = Symbol('COMBO_ITEM_SERVICE');
export const CATALOG_IMPORT_SERVICE = Symbol('CATALOG_IMPORT_SERVICE');
