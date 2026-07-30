import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/role.decorator';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Must run AFTER JwtAuthGuard (Nest applies guards in the order listed
 * in @UseGuards), since it reads request.user which only JwtAuthGuard sets.
 * If a route has no @Roles() decorator, this guard allows access by default —
 * it only restricts routes that explicitly opt in.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;

    return !!user && requiredRoles.includes(user.role);
  }
}