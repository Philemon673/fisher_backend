import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all reviews, optionally filtered by productId.
   * Public endpoint — no auth required.
   */
  async findAll(productId?: string) {
    return this.prisma.review.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        productId: true,
        productName: true,
        name: true,
        quote: true,
        rating: true,
        avatarUrl: true,
        email: true,
        createdAt: true,
        // expose minimal user info (avatar from Google account)
        user: {
          select: { avatarUrl: true, name: true },
        },
      },
    });
  }

  /**
   * Create a new review. userId is optional so even guests can post.
   */
  async create(dto: CreateReviewDto, userId?: string) {
    return this.prisma.review.create({
      data: {
        userId: userId ?? null,
        productId: dto.productId ?? null,
        productName: dto.productName ?? null,
        name: dto.name.trim(),
        quote: dto.quote.trim(),
        rating: dto.rating,
        avatarUrl: dto.avatarUrl ?? null,
        email: dto.email ?? null,
      },
    });
  }

  /**
   * Delete a review by id. Admin-only — enforced at the controller level.
   */
  async remove(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id } });
    return { success: true };
  }
}
