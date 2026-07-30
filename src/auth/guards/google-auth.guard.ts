import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Thin wrapper around Passport's 'google' strategy.
 * Applied to both the entry route (GET /auth/google) and the callback
 * route (GET /auth/google/callback) — Passport handles the redirect
 * dance transparently for both.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}