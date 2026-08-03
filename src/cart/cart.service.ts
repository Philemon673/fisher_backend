import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds a product to the user's cart. If the product is already in the
   * cart (enforced by the @@unique([userId, productId]) constraint on
   * CartItem), increments the existing quantity instead of failing on a
   * duplicate-key error — the behavior decided on earlier in this build.
   */
  async addItem(userId: string, dto: AddToCartDto) {
    const product = await this.getPurchasableProductOrThrow(dto.productId);

    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId: dto.productId } },
    });

    const desiredQuantity = (existing?.quantity ?? 0) + dto.quantity;
    this.ensureQuantityAvailable(product, desiredQuantity);

    return this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      create: { userId, productId: dto.productId, quantity: dto.quantity },
      update: { quantity: desiredQuantity },
      include: this.cartItemInclude(),
    });
  }

  async findAll(userId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: this.cartItemInclude(),
      orderBy: { createdAt: 'desc' },
    });

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );

    return { items, subtotal, itemCount: items.length };
  }

  async updateQuantity(userId: string, cartItemId: string, dto: UpdateCartDto) {
    const cartItem = await this.ensureOwnership(userId, cartItemId);

    this.ensureQuantityAvailable(cartItem.product, dto.quantity);

    return this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity: dto.quantity },
      include: this.cartItemInclude(),
    });
  }

  async removeItem(userId: string, cartItemId: string) {
    await this.ensureOwnership(userId, cartItemId);

    await this.prisma.cartItem.delete({ where: { id: cartItemId } });
    return { success: true };
  }

  /**
   * Clears the entire cart. Used by orders/ once a checkout successfully
   * creates an Order — exported so OrdersService can call it directly
   * without going through HTTP.
   */
  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async getPurchasableProductOrThrow(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.deletedAt || !product.isPublished) {
      throw new NotFoundException('Product not found');
    }

    if (product.stockStatus === StockStatus.OUT_OF_STOCK) {
      throw new BadRequestException('This product is currently out of stock');
    }

    if (product.stockStatus === StockStatus.DISCONTINUED) {
      throw new BadRequestException('This product is no longer available');
    }

    return product;
  }

  private ensureQuantityAvailable(
    product: { stockQuantity: number; name: string },
    desiredQuantity: number,
  ): void {
    if (desiredQuantity > product.stockQuantity) {
      throw new BadRequestException(
        `Only ${product.stockQuantity} unit(s) of "${product.name}" available`,
      );
    }
  }

  /**
   * Confirms the cart item exists AND belongs to the requesting user,
   * returning it with its product included so callers don't need a
   * second query. Returns NotFound (not Forbidden) for someone else's
   * cart item — same reasoning as address ownership checks in users/.
   */
  private async ensureOwnership(userId: string, cartItemId: string) {
    const cartItem = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: this.cartItemInclude(),
    });

    if (!cartItem || cartItem.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    return cartItem;
  }

  private cartItemInclude() {
    return {
      product: {
        include: {
          images: { orderBy: { position: 'asc' as const }, take: 1 },
        },
      },
    };
  }
}