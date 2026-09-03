import { BadRequestException, type PipeTransform } from '@nestjs/common';

interface ParseIssue {
  message: string;
}

interface SafeParseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: ParseIssue[] } };
}

/**
 * Genérico de propósito — sem hack de domínio embutido (diferente do
 * homônimo em delivery-zones/, que carrega uma checagem de city/polygon
 * específica). createPromotionSchema/updatePromotionSchema já expressam suas
 * regras via `.refine()`; este pipe só traduz zod → 400.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: SafeParseSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new BadRequestException(message || 'Payload inválido.');
  }
}
