import { BadRequestException, type PipeTransform } from '@nestjs/common';

interface ParseIssue {
  message: string;
}

interface SafeParseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: ParseIssue[] } };
}

/** Genérico — mesmo padrão de coupons/zod-validation.pipe.ts. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: SafeParseSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new BadRequestException(message || 'Payload inválido.');
  }
}
