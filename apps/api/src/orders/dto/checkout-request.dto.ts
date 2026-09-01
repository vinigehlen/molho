import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { CheckoutRequest, FulfillmentType, PaymentMethod } from '@molho/contracts';
import { FulfillmentAddressMismatchError } from '../order-errors';

const PAYMENT_METHODS: readonly PaymentMethod[] = ['pix', 'cash_on_delivery', 'card_on_delivery'];
const FULFILLMENT_TYPES: readonly FulfillmentType[] = ['delivery', 'pickup'];

/** Espelha o objeto de modifiers de checkoutItemInputSchema (@molho/contracts/checkout.ts). */
class CheckoutModifierInputDto {
  @IsUUID()
  modifierId!: string;

  @IsInt()
  @Min(0)
  priceDeltaCents!: number;
}

/** Espelha checkoutItemInputSchema. */
class CheckoutItemInputDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  offerId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  removedChildIds?: string[];

  @IsInt()
  @Min(0)
  unitBasePriceCents!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutModifierInputDto)
  modifiers!: CheckoutModifierInputDto[];

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes!: string | null;
}

/**
 * Espelha checkoutAddressInputSchema (Épico 6, Bloco 2): CEP + número
 * obrigatórios, lat/lng NUNCA vêm do cliente.
 *
 * street/neighborhood/city/state são fallback de TEXTO e aceitam string
 * vazia (`@IsString()` sem `@IsNotEmpty()`) — o normal é o ViaCEP no
 * servidor sobrescrever todos eles. Exigir não-vazio aqui rejeitaria o
 * caminho feliz.
 */
class CheckoutAddressInputDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP precisa ter 8 dígitos' })
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsOptional()
  @IsString()
  complement!: string | null;

  @IsString()
  street!: string;

  @IsString()
  neighborhood!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsOptional()
  @IsString()
  referencePoint!: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedDeliveryFeeCents!: number | null;
}

/**
 * Espelha checkoutRequestSchema (union discriminada por `paymentMethod`,
 * Épico 8, docs/02 §5.5) — usado pelos DOIS endpoints (revalidate e
 * orders). `class-validator` não tem union discriminada nativa como o zod;
 * `changeForCents` fica sempre presente na CLASSE (widening estrutural
 * inevitável aqui), mas só é validado/lido quando `paymentMethod ===
 * 'cash_on_delivery'` (`@ValidateIf`) — `CheckoutOrderService` é quem
 * decide se o campo é relevante pro branch, e a união de VERDADE (zod) só
 * existe do lado dos contratos/response.
 */
export class CheckoutRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemInputDto)
  items!: CheckoutItemInputDto[];

  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType!: FulfillmentType;

  /**
   * Obrigatório em `delivery`, PROIBIDO em `pickup` — a combinação certa é
   * responsabilidade do zod (`checkoutRequestSchema.refine`, checado em
   * `toCheckoutRequest` abaixo), não do `class-validator` aqui: `@ValidateIf`
   * só sabe pular a validação de FORMA do endereço quando é pickup, não
   * rejeitar um endereço que veio mandado por engano.
   */
  @ValidateIf((dto: CheckoutRequestDto) => dto.fulfillmentType === 'delivery')
  @ValidateNested()
  @Type(() => CheckoutAddressInputDto)
  address!: CheckoutAddressInputDto | null;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  /**
   * Só validado/relevante quando paymentMethod === 'cash_on_delivery';
   * ignorado nos outros dois. `@IsOptional()` deixa `null` passar
   * (`null` = "não precisa de troco" — schema zod usa `.nullable()`, não
   * `.optional()`, mesma semântica aqui).
   */
  @ValidateIf((dto: CheckoutRequestDto) => dto.paymentMethod === 'cash_on_delivery')
  @IsOptional()
  @IsInt()
  @Min(0)
  changeForCents?: number | null;

  /** Espelha checkoutRequestSchema.couponCode (Épico conversão, C2) — opcional, fora da união de paymentMethod. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  couponCode?: string;

  /** Espelha checkoutRequestSchema.scheduledFor (Épico conversão, C3) — opcional, ISO 8601. */
  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;
}

/**
 * `CheckoutRequestDto` é uma classe FLAT (`paymentMethod` tipado como a
 * union larga, não um literal específico) — TS não aceita isso direto onde
 * `CheckoutRequest` (união discriminada de verdade) é esperado, mesmo
 * limitação estrutural documentada na classe acima. Narra em cima do valor
 * REAL de `paymentMethod` (runtime, não tipo) pra reconstruir o objeto no
 * branch certo — é isso que faz o `if` valer como type guard.
 */
export function toCheckoutRequest(dto: CheckoutRequestDto): CheckoutRequest {
  const { items, fulfillmentType, address, couponCode, scheduledFor } = dto;
  // Espelha checkoutRequestSchema.refine (@molho/contracts/checkout.ts) — lá é
  // só documentação de forma (nunca roda em runtime na API, o `class-validator`
  // é quem valida de verdade aqui). `delivery` sem endereço, ou `pickup` COM
  // endereço, são os dois request malformado, nunca "ignora e segue".
  if ((fulfillmentType === 'delivery') !== (address !== null)) {
    throw new FulfillmentAddressMismatchError();
  }
  if (dto.paymentMethod === 'cash_on_delivery') {
    return {
      items,
      fulfillmentType,
      address,
      couponCode,
      scheduledFor,
      paymentMethod: 'cash_on_delivery',
      changeForCents: dto.changeForCents ?? null,
    };
  }
  if (dto.paymentMethod === 'pix') {
    return { items, fulfillmentType, address, couponCode, scheduledFor, paymentMethod: 'pix' };
  }
  return { items, fulfillmentType, address, couponCode, scheduledFor, paymentMethod: 'card_on_delivery' };
}
