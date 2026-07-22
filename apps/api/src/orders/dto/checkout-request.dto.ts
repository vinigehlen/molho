import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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

/** Espelha checkoutAddressInputSchema. */
class CheckoutAddressInputDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsOptional()
  @IsString()
  number!: string | null;

  @IsOptional()
  @IsString()
  complement!: string | null;

  @IsString()
  @IsNotEmpty()
  neighborhood!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsOptional()
  @IsString()
  postalCode!: string | null;

  @IsOptional()
  @IsString()
  referencePoint!: string | null;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedDeliveryFeeCents!: number | null;
}

/** Espelha checkoutRequestSchema — usado pelos DOIS endpoints (revalidate e orders). */
export class CheckoutRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemInputDto)
  items!: CheckoutItemInputDto[];

  @ValidateNested()
  @Type(() => CheckoutAddressInputDto)
  address!: CheckoutAddressInputDto;
}
