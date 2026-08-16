import { PartialType, OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ProductImageInputDto, ProductVideoInputDto } from './product-media.dto';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string; // auto-generated if omitted — see ProductsService

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slug?: string; // auto-generated from name if omitted

  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductVideoInputDto)
  video?: ProductVideoInputDto;
}

// sku is intentionally excluded from updates — changing a SKU after
// creation is a data-integrity footgun (order history, external
// inventory systems, etc. may already reference it).
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['sku'] as const),
) {}
