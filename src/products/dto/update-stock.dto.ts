import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { StockStatus } from '@prisma/client';

export class UpdateStockDto {
  @IsEnum(StockStatus)
  stockStatus: StockStatus;

  // Optional — lets admin update the actual count in the same call,
  // e.g. restocking. If omitted, only the status flag changes.
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;
}
