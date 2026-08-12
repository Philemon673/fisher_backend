import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches a single user's public profile shape. Throws rather than
   * returning null so controllers never have to null-check on a route
   * that should be unreachable with a bad ID (the JWT already guarantees
   * the user exists at auth time — this only fires in edge cases like
   * an admin looking up a user that was deleted moments ago).
   */
  async findById(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: this.publicUserSelect(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: this.publicUserSelect(),
    });
  }

  /**
   * Admin-only paginated listing with optional search across name/email.
   * Deliberately excludes soft-deleted users unless explicitly requested,
   * since a deactivated account showing up in a normal admin list would
   * be a confusing default.
   */
  async findAllForAdmin(query: PaginationQueryDto) {
    const { page, limit, search } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.publicUserSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin action to suspend/reinstate an account without destroying history.
   * Deliberately separate from deletion — this is reversible.
   */
  async setActiveStatus(userId: string, isActive: boolean) {
    await this.ensureUserExists(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: this.publicUserSelect(),
    });
  }

  /**
   * Promotes or demotes a user's role. Guarded at the controller level
   * with @Roles(Role.ADMIN), so only an existing admin can ever call
   * this — the only OTHER way to create an admin is a direct database
   * edit, which is intentional (no self-service "become admin" path).
   *
   * requestingAdminId is passed so we can block an admin from
   * accidentally demoting themselves via this endpoint — that would
   * either lock them out mid-session or, worse, leave a system with
   * zero admins if they're the only one. Self-demotion should go
   * through a separate, more deliberate flow if you ever need it.
   */
  async setRole(userId: string, newRole: Role, requestingAdminId: string) {
    await this.ensureUserExists(userId);

    if (userId === requestingAdminId && newRole !== Role.ADMIN) {
      throw new BadRequestException(
        'You cannot change your own role away from ADMIN through this endpoint',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: this.publicUserSelect(),
    });
  }

  // ─────────────────────────────────────────────
  // Addresses
  // ─────────────────────────────────────────────

  async listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    // If this is marked default, un-default any existing ones first —
    // enforced in a transaction so we never end up with two defaults.
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: { ...dto, userId },
      });
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.ensureAddressOwnership(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: dto,
      });
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    await this.ensureAddressOwnership(userId, addressId);

    await this.prisma.address.delete({ where: { id: addressId } });
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async ensureUserExists(userId: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  /**
   * Confirms the address exists AND belongs to the requesting user.
   * Returning NotFound (not Forbidden) for an address owned by someone
   * else is intentional — it avoids leaking whether a given address ID
   * exists at all to a user who has no business knowing.
   */
  private async ensureAddressOwnership(
    userId: string,
    addressId: string,
  ): Promise<void> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }
  }

  private publicUserSelect() {
    return {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      // Deliberately excludes: googleId, deletedAt, and any relation
      // that isn't needed on a profile response.
    } satisfies Prisma.UserSelect;
  }
}