import { IsInt, Min } from 'class-validator';

// Deliberately its own DTO, not PartialType(AddToCartDto) — productId
// should never be editable on an existing cart line. Changing product
// means a new cart item, not an edit to this one.
export class UpdateCartDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

