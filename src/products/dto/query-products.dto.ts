import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StockStatus } from '@prisma/client';

export class QueryProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  search?: string; // matches against name

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(StockStatus)
  stockStatus?: StockStatus;

  // Admin-only in practice (enforced in the controller/service, not here) —
  // lets an admin view unpublished drafts alongside live products.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUnpublished?: boolean;
}