import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { StorageModule } from '../storage/storage.module';
import { CategoriesController } from './categories.controller';
import { CategoryService } from './category.service';
import { PrismaCategoryRepository } from './category.repository';
import { ModifiersController } from './modifiers.controller';
import { ModifierService } from './modifier.service';
import { PrismaModifierRepository } from './modifier.repository';
import { ModifierGroupsController } from './modifier-groups.controller';
import { ModifierGroupService } from './modifier-group.service';
import { PrismaModifierGroupRepository } from './modifier-group.repository';
import { ProductsController } from './products.controller';
import { ProductService } from './product.service';
import { PrismaProductRepository } from './product.repository';
import { CatalogImportController } from './import/catalog-import.controller';
import { CatalogImportService } from './import/catalog-import.service';
import {
  CATALOG_IMPORT_SERVICE,
  CATEGORY_SERVICE,
  MODIFIER_GROUP_SERVICE,
  MODIFIER_SERVICE,
  PRODUCT_SERVICE,
} from './catalog.tokens';

export { CATEGORY_SERVICE, PRODUCT_SERVICE, MODIFIER_GROUP_SERVICE, MODIFIER_SERVICE, CATALOG_IMPORT_SERVICE };

/**
 * Controllers de categories/products chegaram no commit 4, com os guards
 * @RequireModule/@RequirePermission (AuthModule) pela primeira vez neste
 * código. modifier-groups/modifiers chegam no commit 5, mesma infra —
 * services já existiam desde o commit 3, só faltava a camada HTTP deles.
 *
 * TokenModule e ModuleCheckModule entram aqui em ADIÇÃO a AuthModule: guard
 * referenciado por classe em @UseGuards() é resolvido no injector do módulo
 * que declara o CONTROLLER, não no injector do módulo que o exporta — as
 * dependências de JwtAuthGuard (TOKEN_SERVICE) e RequireModuleGuard
 * (MODULE_CACHE) precisam estar visíveis aqui também, não só em AuthModule
 * (achado rodando `nest start` de verdade: exportar a classe do guard não
 * basta, sem isto o Nest não resolve `Symbol(TOKEN_SERVICE)` dentro de
 * CatalogModule).
 */
@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule, StorageModule],
  controllers: [
    CategoriesController,
    ProductsController,
    ModifierGroupsController,
    ModifiersController,
    CatalogImportController,
  ],
  providers: [
    {
      provide: CATEGORY_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): CategoryService =>
        new CategoryService(new PrismaCategoryRepository(requestContext)),
    },
    {
      provide: PRODUCT_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): ProductService =>
        new ProductService(new PrismaProductRepository(requestContext)),
    },
    {
      provide: MODIFIER_GROUP_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): ModifierGroupService =>
        new ModifierGroupService(new PrismaModifierGroupRepository(requestContext)),
    },
    {
      provide: MODIFIER_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): ModifierService =>
        new ModifierService(new PrismaModifierRepository(requestContext)),
    },
    {
      provide: CATALOG_IMPORT_SERVICE,
      inject: [CATEGORY_SERVICE, PRODUCT_SERVICE],
      useFactory: (categories: CategoryService, products: ProductService): CatalogImportService =>
        new CatalogImportService(categories, products),
    },
  ],
  exports: [CATEGORY_SERVICE, PRODUCT_SERVICE, MODIFIER_GROUP_SERVICE, MODIFIER_SERVICE, CATALOG_IMPORT_SERVICE],
})
export class CatalogModule {}
