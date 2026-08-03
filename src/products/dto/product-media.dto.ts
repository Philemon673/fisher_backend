import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

/**
 * These do NOT accept a raw file — by design. The flow is: admin calls
 * POST /uploads/image first (uploads/ module), gets back { url, publicId },
 * then includes that result here when creating/updating a product.
 * Keeping upload and product-creation as separate steps means a failed
 * product creation never wastes a re-upload, and the admin UI can show
 * upload progress per file before final submission.
 */
export class ProductImageInputDto {
  @IsUrl()
  url: string;

  @IsString()
  publicId: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class ProductVideoInputDto {
  @IsUrl()
  url: string;

  @IsString()
  publicId: string;
}