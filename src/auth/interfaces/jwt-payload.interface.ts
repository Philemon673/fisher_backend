import { Role } from '@prisma/client';

/**
 * Shape of the payload encoded inside every access token we issue.
 * Kept minimal on purpose — anything beyond identity + role should be
 * fetched fresh from the database, not trusted from an old token.
 */
export interface JwtPayload {
  sub: string; // User.id (our own cuid, not Google's)
  email: string;
  role: Role;
}

/**
 * Shape Passport attaches to `request.user` after JwtStrategy.validate() runs.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}