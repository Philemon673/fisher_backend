import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Runs JwtStrategy the same way JwtAuthGuard does, but overrides
 * handleRequest so a missing or invalid token never throws — it just
 * means request.user stays undefined. Use this on public routes that
 * want to behave differently for a logged-in admin without forcing
 * every visitor to authenticate.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any): any {
    // Deliberately swallow errors/missing user instead of throwing —
    // this is the entire point of this guard vs. the strict one.
    return user ?? null;
  }
}
