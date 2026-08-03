import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public catalog browsing. Returns top-level categories with their
   * immediate children nested — enough for a typical nav menu or filter
   * sidebar without needing a separate request per level.
   */
  async findAll() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
        },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: { orderBy: { name: 'asc' } },
        parent: true,
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.ensureParentExists(dto.parentId);
    }

    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      throw this.handleUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      await this.ensureParentExists(dto.parentId);
      await this.ensureNotDescendant(id, dto.parentId);
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      throw this.handleUniqueConstraintError(error);
    }
  }

  /**
   * Blocks deletion if the category still has products or subcategories
   * attached, rather than silently orphaning them. Admin must reassign
   * or remove those first — an intentional friction point to prevent
   * accidental data loss.
   */
  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.products > 0) {
      throw new ConflictException(
        `Cannot delete category with ${category._count.products} product(s) still assigned to it`,
      );
    }

    if (category._count.children > 0) {
      throw new ConflictException(
        'Cannot delete a category that still has subcategories',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.category.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Category not found');
    }
  }

  private async ensureParentExists(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new BadRequestException('parentId does not reference an existing category');
    }
  }

  /**
   * Prevents creating a cycle in the category tree (e.g. A's parent is B,
   * and someone tries to set B's parent to A). Walks up the chain from
   * the proposed new parent — if it ever reaches the category being
   * updated, that would form a loop.
   */
  private async ensureNotDescendant(
    categoryId: string,
    proposedParentId: string,
  ): Promise<void> {
    let currentId: string | null = proposedParentId;

    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException(
          'This would create a circular category hierarchy',
        );
      }

      const current = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      currentId = current?.parentId ?? null;
    }
  }

  private handleUniqueConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const field = (error.meta?.target as string[])?.[0] ?? 'field';
      throw new ConflictException(`A category with this ${field} already exists`);
    }
    throw error;
  }
}