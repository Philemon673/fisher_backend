import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) { }

  async create(dto: CreateProductDto) {
    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    const slug = dto.slug ?? this.slugify(dto.name);
    const sku = dto.sku ?? (await this.generateSku());

    try {
      return await this.prisma.product.create({
        data: {
          sku,
          slug,
          name: dto.name,
          description: dto.description,
          price: dto.price,
          currency: dto.currency ?? 'USD',
          stockQuantity: dto.stockQuantity ?? 0,
          isPublished: dto.isPublished ?? true,
          categoryId: dto.categoryId,
          // Nested writes — Prisma creates Product, then ProductImage rows,
          // then ProductVideo, all in one transaction. If any part fails,
          // nothing is committed.
          images: dto.images?.length
            ? {
              create: dto.images.map((img, index) => ({
                url: img.url,
                publicId: img.publicId,
                altText: img.altText,
                position: img.position ?? index,
              })),
            }
            : undefined,
          video: dto.video
            ? { create: { url: dto.video.url, publicId: dto.video.publicId } }
            : undefined,
        },
        include: this.fullProductInclude(),
      });
    } catch (error) {
      throw this.handleUniqueConstraintError(error);
    }
  }

  /**
   * Public + admin listing, branching on whether unpublished/out-of-stock
   * items should be visible. Storefront calls should never pass
   * includeUnpublished: true — that's gated at the controller level.
   */
  async findAll(query: QueryProductsDto, isAdminRequest: boolean) {
    const { page, limit, search, categoryId, stockStatus, includeUnpublished } = query;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(stockStatus && { stockStatus }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
      // Public requests only ever see published products, regardless of
      // what query params they send — isAdminRequest is set by the
      // controller based on the guard, not trusted from client input.
      ...(!isAdminRequest || !includeUnpublished ? { isPublished: true } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: this.fullProductInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.fullProductInclude(),
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.ensureExists(id);

    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          currency: dto.currency,
          stockQuantity: dto.stockQuantity,
          isPublished: dto.isPublished,
          categoryId: dto.categoryId,
          slug: dto.slug,
        },
        include: this.fullProductInclude(),
      });
    } catch (error) {
      throw this.handleUniqueConstraintError(error);
    }
  }

  /**
   * Dedicated stock endpoint, matching the original requirement that
   * admin can independently mark a product in/out of stock without
   * touching the rest of the product record.
   */
  async updateStock(id: string, dto: UpdateStockDto) {
    await this.ensureExists(id);

    return this.prisma.product.update({
      where: { id },
      data: {
        stockStatus: dto.stockStatus,
        ...(dto.stockQuantity !== undefined && { stockQuantity: dto.stockQuantity }),
        // Convenience: if quantity hits zero via this endpoint and admin
        // didn't explicitly set a status, reflect it automatically.
        ...(dto.stockQuantity === 0 &&
          dto.stockStatus === undefined && { stockStatus: StockStatus.OUT_OF_STOCK }),
      },
      include: this.fullProductInclude(),
    });
  }

  /**
   * Soft delete only — OrderItem rows reference this product and must
   * keep working for historical order views. Also removes the product's
   * media from Cloudinary, since a hidden product has no further use
   * for its images (the ProductImage/ProductVideo rows stay in Postgres
   * via cascade only if you hard-delete, which we deliberately don't do).
   */
  async remove(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true, video: true },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    await Promise.all([
      ...product.images.map((img) =>
        this.uploadsService.delete(img.publicId, 'image').catch(() => undefined),
      ),
      product.video
        ? this.uploadsService.delete(product.video.publicId, 'video').catch(() => undefined)
        : Promise.resolve(),
    ]);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isPublished: false },
    });

    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async ensureExists(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('categoryId does not reference an existing category');
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Generates a simple, readable SKU when the admin doesn't supply one.
   * Not guaranteed collision-proof under high concurrency, but the
   * @unique constraint on sku means a rare collision surfaces as a
   * clean 409 rather than silently overwriting data.
   */
  private async generateSku(): Promise<string> {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SKU-${Date.now().toString(36).toUpperCase()}-${random}`;
  }

  private fullProductInclude() {
    return {
      images: { orderBy: { position: 'asc' } },
      video: true,
      category: true,
    } satisfies Prisma.ProductInclude;
  }

  private handleUniqueConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const field = (error.meta?.target as string[])?.[0] ?? 'field';
      throw new ConflictException(`A product with this ${field} already exists`);
    }
    throw error;
  }
}