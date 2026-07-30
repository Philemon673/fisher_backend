import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Usage: @Roles(Role.ADMIN) on top of a route already guarded by JwtAuthGuard.
 * Must be paired with RolesGuard to actually enforce anything —
 * this decorator only attaches metadata, it doesn't check it.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);