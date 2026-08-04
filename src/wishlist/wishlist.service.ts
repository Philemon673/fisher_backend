import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adding a product already on the wishlist is treated as a no-op
   * success rather than an error — unlike cart (where a duplicate add
   * has a meaningful effect: increment quantity), a duplicate wishlist
   * add has no meaningful second effect, so idempotent behavior is the
   * least surprising choice for the client. upsert() with an identical
   * update payload achieves this cleanly against the same
   * @@unique([userId, productId]) constraint used in CartItem.
   */
  async addItem(userId: string, dto: AddToWishlistDto) {
    await this.ensureProductExists(dto.productId);

    return this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      create: { userId, productId: dto.productId },
      update: {}, // already exists — nothing to change, just return it
      include: this.wishlistItemInclude(),
    });
  }

  async findAll(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: this.wishlistItemInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return { items, itemCount: items.length };
  }

  async removeItem(userId: string, wishlistItemId: string) {
    await this.ensureOwnership(userId, wishlistItemId);

    await this.prisma.wishlistItem.delete({ where: { id: wishlistItemId } });
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async ensureProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }
    // Deliberately no stock/publish check here — a wishlist can
    // reasonably hold an out-of-stock item; that's arguably the whole
    // point (customer wants to know when it's back).
  }

  private async ensureOwnership(userId: string, wishlistItemId: string): Promise<void> {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { id: wishlistItemId },
    });

    if (!item || item.userId !== userId) {
      throw new NotFoundException('Wishlist item not found');
    }
  }

  private wishlistItemInclude() {
    return {
      product: {
        include: {
          images: { orderBy: { position: 'asc' as const }, take: 1 },
        },
      },
    };
  }
}