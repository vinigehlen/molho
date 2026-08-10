import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import type { GuestCustomer } from '@molho/contracts';
import { CheckoutRequestDto } from './checkout-request.dto';

/** Espelha `guestCustomerSchema` (@molho/contracts/storefront.ts). */
export class GuestCustomerDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 80)
  name!: string;

  /**
   * Forma só — `parsePhoneNumber` no service é quem valida DDD real e nono
   * dígito, e é dele que sai o E.164 que chaveia a identidade (CLAUDE.md §
   * Segurança: telefone é sempre `PhoneNumber`, nunca string bruta).
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}

/**
 * Body do `POST /checkout/orders` — `CheckoutRequestDto` MAIS a identidade
 * auto-declarada do checkout guest.
 *
 * O bloco `customer` existe SÓ aqui, e não no `CheckoutRequestDto`
 * compartilhado, porque aquele também serve o `/checkout/revalidate` — público,
 * anônimo e de alto volume. Telefone na classe compartilhada levaria PII pra
 * uma superfície que não precisa dela (CLAUDE.md regra 13, EMENDA).
 *
 * `@IsOptional()`: o campo é obrigatório ou proibido conforme haver ou não JWT,
 * e isso o `class-validator` não tem como saber. As duas rejeições
 * (`GuestCustomerRequiredError`/`GuestCustomerNotAllowedError`) moram no
 * service, junto do resto da decisão de identidade.
 */
export class CheckoutOrderRequestDto extends CheckoutRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestCustomerDto)
  customer?: GuestCustomerDto;
}

/** Normaliza pro tipo do contrato — `undefined` (campo ausente) e `null` são a MESMA coisa aqui: request anônima sem identidade declarada. */
export function toGuestCustomer(dto: CheckoutOrderRequestDto): GuestCustomer | null {
  if (!dto.customer) return null;
  return { name: dto.customer.name.trim(), phone: dto.customer.phone };
}
