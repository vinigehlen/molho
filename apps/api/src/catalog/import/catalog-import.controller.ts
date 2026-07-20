import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequireModule } from '../../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../../auth/guards/require-module.guard';
import { RequirePermission } from '../../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../../auth/guards/tenant-context.interceptor';
import { CatalogExceptionFilter } from '../catalog-exception.filter';
import { CATALOG_IMPORT_SERVICE } from '../catalog.tokens';
import type { CatalogImportService } from './catalog-import.service';
import { buildImportTemplate } from './catalog-import-template';

const MAX_IMPORT_FILE_BYTES = Number(process.env.MOLHO_MAX_IMPORT_FILE_BYTES ?? 2_097_152);
const ALLOWED_EXTENSIONS = /\.(csv|xlsx)$/i;

/**
 * Mesmo desenho de guards/interceptor dos outros controllers de catálogo —
 * ver comentário em CategoriesController. `catalog.import` já existe desde
 * o commit 1 (permissão granular dedicada, não reaproveita
 * catalog.product.create — importar planilha é uma ação distinta de criar
 * produto um a um).
 */
@Controller('v1/admin/catalog/import')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
@RequirePermission('catalog.import')
export class CatalogImportController {
  constructor(@Inject(CATALOG_IMPORT_SERVICE) private readonly importService: CatalogImportService) {}

  @Get('template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="molho-template-cardapio.xlsx"')
  downloadTemplate(@Res() res: Response): void {
    res.send(buildImportTemplate());
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File) {
    this.assertValidFile(file);
    return this.importService.preview(file.buffer);
  }

  @Post('commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async commit(@UploadedFile() file: Express.Multer.File) {
    this.assertValidFile(file);
    return this.importService.commit(file.buffer);
  }

  private assertValidFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('Arquivo obrigatório (campo "file").');
    if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
      throw new BadRequestException('Formato inválido — envie .csv ou .xlsx.');
    }
  }
}
