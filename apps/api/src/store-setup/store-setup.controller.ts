import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  storeBrandUploadUrlSchema,
  type StoreBrandUploadUrlInput,
  type UpdateStoreSetupInput,
  type UpdateThemeInput,
  updateStoreSetupSchema,
  updateThemeSchema,
} from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { RequestWithGeocode } from '../geo/geocode.middleware';
import { resolveAddress } from '../geo/resolve-address';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { STORAGE_PROVIDER, UPLOAD_URL_RATE_LIMITER } from '../storage/storage.module';
import { isAllowedImageContentType, type StorageProvider } from '../storage/storage-provider.port';
import { STORE_SETUP_SERVICE } from './store-setup.tokens';
import { StoreSetupNotFoundError, StoreSetupValidationError } from './store-setup.errors';
import type { StoreSetupService } from './store-setup.service';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';

@Controller('v1/admin/stores/:storeId/setup')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@RequireModule('catalog')
export class StoreSetupController {
  constructor(
    @Inject(STORE_SETUP_SERVICE) private readonly setup: StoreSetupService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(UPLOAD_URL_RATE_LIMITER) private readonly rateLimiter: RateLimiter,
  ) {}

  @Get()
  @UseInterceptors(TenantContextInterceptor)
  get(@Param('storeId') storeId: string, @Req() req: RequestWithUser) {
    return this.handle(() => this.setup.get(storeId, req.user.sub));
  }

  @Put()
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermission('catalog.product.update')
  update(
    @Param('storeId') storeId: string,
    @Req() req: RequestWithUser & RequestWithGeocode,
    @Body(new ZodValidationPipe(updateStoreSetupSchema)) dto: UpdateStoreSetupInput,
  ) {
    const tenantId = requireTenantIdHeader(req);
    return this.handle(() =>
      this.setup.update(
        storeId,
        dto,
        { userId: req.user.sub, role: resolveActorRole(req, tenantId) },
        dto.postalCode ? resolveAddress(addressFallback(dto), req.geocoded) : null,
      ),
    );
  }

  @Post('brand-upload-url')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.CREATED)
  async createBrandUploadUrl(
    @Body(new ZodValidationPipe(storeBrandUploadUrlSchema)) dto: StoreBrandUploadUrlInput,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!isAllowedImageContentType(dto.contentType)) throw new BadRequestException('Formato de imagem inválido.');
    const tenantId = requireTenantIdHeader(req);
    const withinLimit = await this.rateLimiter.checkAndRecord(
      `store-brand-upload-url:${tenantId}:${req.user.sub}`,
      30,
      3600,
    );
    if (!withinLimit) {
      res.set('Retry-After', '60');
      throw new HttpException(
        { error: 'rate_limited', message: 'Muitas URLs de upload geradas — tente de novo em instantes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const presigned = await this.storage.createPresignedUpload({
        tenantId,
        folder: 'stores',
        contentType: dto.contentType,
        contentLength: dto.contentLength,
      });
      return { uploadUrl: presigned.url, key: presigned.key, expiresAt: presigned.expiresAt.toISOString() };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Serviço de upload de imagem temporariamente indisponível.');
    }
  }

  @Put('theme')
  @RequirePermission('catalog.product.update')
  updateTheme(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(updateThemeSchema)) dto: UpdateThemeInput,
  ) {
    return this.handle(() => this.setup.updateTheme(storeId, dto.themeKey));
  }

  @Post('publish')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.OK)
  publish(@Param('storeId') storeId: string, @Req() req: RequestWithUser) {
    return this.handle(() => this.setup.publish(storeId, req.user.sub));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StoreSetupNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof StoreSetupValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

function addressFallback(input: UpdateStoreSetupInput) {
  return {
    street: input.street ?? '',
    neighborhood: input.neighborhood ?? '',
    city: input.city ?? '',
    state: input.state ?? '',
  };
}

function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
