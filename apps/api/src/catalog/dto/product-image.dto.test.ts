import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateImageUploadUrlDto } from './product-image.dto';

/**
 * Validação testada DIRETO via class-validator (não via HTTP/Nest) —
 * ValidationPipe depende de emitDecoratorMetadata pra saber que o parâmetro
 * @Body() é uma CreateImageUploadUrlDto; o transform esbuild que o Vitest
 * usa por padrão pra rodar Test.createTestingModule NÃO emite essa
 * metadata (é conhecido: esbuild suporta só a sintaxe de decorator, não
 * `--emitDecoratorMetadata`, que exige o typechecker completo do tsc).
 * Rodando através do servidor real (`nest start`, tsc de verdade) a mesma
 * validação funciona (confirmado manualmente) — mas testar isso via HTTP
 * simulado no Vitest daria falso-negativo. Testar a classe diretamente
 * evita depender desse caminho quebrado no harness de teste.
 */
describe('CreateImageUploadUrlDto', () => {
  it('1) aceita contentType/contentLength válidos sem erros', async () => {
    const dto = plainToInstance(CreateImageUploadUrlDto, { contentType: 'image/png', contentLength: 1024 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('2) rejeita contentType fora do whitelist (jpeg/png/webp)', async () => {
    const dto = plainToInstance(CreateImageUploadUrlDto, { contentType: 'application/pdf', contentLength: 1024 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('isIn');
  });

  it('3) rejeita contentLength acima do teto (MOLHO_MAX_IMAGE_BYTES)', async () => {
    const maxBytes = Number(process.env.MOLHO_MAX_IMAGE_BYTES ?? 5_242_880);
    const dto = plainToInstance(CreateImageUploadUrlDto, { contentType: 'image/png', contentLength: maxBytes + 1 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('max');
  });

  it('4) aceita contentLength exatamente no teto (limite inclusivo)', async () => {
    const maxBytes = Number(process.env.MOLHO_MAX_IMAGE_BYTES ?? 5_242_880);
    const dto = plainToInstance(CreateImageUploadUrlDto, { contentType: 'image/png', contentLength: maxBytes });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('5) rejeita contentLength <= 0', async () => {
    const dto = plainToInstance(CreateImageUploadUrlDto, { contentType: 'image/png', contentLength: 0 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('min');
  });
});
