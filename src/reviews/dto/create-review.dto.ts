import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsString()
  name: string;

  @IsString()
  quote: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
