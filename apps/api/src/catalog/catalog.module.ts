import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { CategoryService } from './category.service';
import { PrismaCategoryRepository } from './category.repository';
import { ModifierService } from './modifier.service';
import { PrismaModifierRepository } from './modifier.repository';
import { ModifierGroupService } from './modifier-group.service';
import { PrismaModifierGroupRepository } from './modifier-group.repository';
import { ProductService } from './product.service';
import { PrismaProductRepository } from './product.repository';

export const CATEGORY_SERVICE = Symbol('CATEGORY_SERVICE');
export const PRODUCT_SERVICE = Symbol('PRODUCT_SERVICE');
export const MODIFIER_GROUP_SERVICE = Symbol('MODIFIER_GROUP_SERVICE');
export const MODIFIER_SERVICE = Symbol('MODIFIER_SERVICE');

/**
 * Só repositories + services (Épico 4, commit 3) — controllers com os
 * guards @RequireModule/@RequirePermission chegam no commit 4, primeira vez
 * que esse par de guards existe neste código (CLAUDE.md § RBAC granular,
 * regra 2). Módulo dedicado, mesmo padrão de TokenModule: importável sem
 * puxar o AppModule inteiro.
 */
@Module({
  imports: [ContextModule],
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
  ],
  exports: [CATEGORY_SERVICE, PRODUCT_SERVICE, MODIFIER_GROUP_SERVICE, MODIFIER_SERVICE],
})
export class CatalogModule {}
