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
const INVALID_FORMAT_MESSAGE = 'Formato inválido — envie .csv ou .xlsx.';
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']);
const XLSX_MIME_TYPES = new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

function importFileExtension(filename: string): 'csv' | 'xlsx' | null {
  const match = filename.toLowerCase().match(/\.([^.]+)$/);
  if (match?.[1] === 'csv' || match?.[1] === 'xlsx') return match[1];
  return null;
}

function isAllowedImportMime(extension: 'csv' | 'xlsx', mimetype: string): boolean {
  return extension === 'csv' ? CSV_MIME_TYPES.has(mimetype) : XLSX_MIME_TYPES.has(mimetype);
}

function hasNulByte(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function isZipFile(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export function assertAllowedImportFileMetadata(file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>): void {
  const extension = importFileExtension(file.originalname);
  if (!extension || !isAllowedImportMime(extension, file.mimetype)) {
    throw new BadRequestException(INVALID_FORMAT_MESSAGE);
  }
}

export function assertAllowedImportFileBuffer(file: Pick<Express.Multer.File, 'originalname' | 'buffer'>): void {
  const extension = importFileExtension(file.originalname);
  if (!extension) throw new BadRequestException(INVALID_FORMAT_MESSAGE);
  if (extension === 'xlsx' && !isZipFile(file.buffer)) throw new BadRequestException(INVALID_FORMAT_MESSAGE);
  if (extension === 'csv' && (isZipFile(file.buffer) || hasNulByte(file.buffer))) {
    throw new BadRequestException(INVALID_FORMAT_MESSAGE);
  }
}

type FileInterceptorOptions = NonNullable<Parameters<typeof FileInterceptor>[1]>;

const IMPORT_FILE_OPTIONS: FileInterceptorOptions = {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES },
  fileFilter: (_req, file, callback: (error: Error | null, acceptFile: boolean) => void) => {
    try {
      assertAllowedImportFileMetadata(file);
      callback(null, true);
    } catch (error) {
      callback(error as Error, false);
    }
  },
};

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
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_OPTIONS))
  preview(@UploadedFile() file: Express.Multer.File) {
    this.assertValidFile(file);
    return this.importService.preview(file.buffer);
  }

  @Post('commit')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_OPTIONS))
  async commit(@UploadedFile() file: Express.Multer.File) {
    this.assertValidFile(file);
    return this.importService.commit(file.buffer);
  }

  private assertValidFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('Arquivo obrigatório (campo "file").');
    if (!ALLOWED_EXTENSIONS.test(file.originalname)) throw new BadRequestException(INVALID_FORMAT_MESSAGE);
    assertAllowedImportFileBuffer(file);
  }
}
