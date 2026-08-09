import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleUserPayload } from './interfaces/google-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_BYTES = 64;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) { }

  /**
   * Entry point called from the Google OAuth callback route.
   * Upserts the user by googleId (never by email alone — emails can be
   * reused/changed, googleId is the stable identifier) and issues a
   * fresh token pair.
   */
  async loginWithGoogle(
    googleUser: GoogleUserPayload,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const user = await this.prisma.user.upsert({
      where: { googleId: googleUser.googleId },
      create: {
        googleId: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.avatarUrl,
      },
      update: {
        // Keep name/avatar fresh in case the user updates their Google profile.
        // Deliberately NOT updating email here — see note below.
        name: googleUser.name,
        avatarUrl: googleUser.avatarUrl,
      },
    });

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    return this.issueTokenPair(user.id, user.email, user.role, context);
  }

  /**
   * Exchanges a valid, unexpired, unrevoked refresh token for a new
   * access token AND a new refresh token (rotation). The old refresh
   * token is revoked in the same transaction so it can never be reused —
   * if someone presents an already-revoked token, that's a strong signal
   * of theft, and we revoke the entire token in response defensively.
   */
  async refreshTokens(
    rawRefreshToken: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Reuse of a revoked token — possible theft. Revoke every active
      // session for this user as a precaution.
      this.logger.warn(
        `Revoked refresh token reused for user ${stored.userId} — revoking all sessions`,
      );
      await this.revokeAllSessionsForUser(stored.userId);
      throw new UnauthorizedException('Session invalid — please log in again');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      context,
    );
  }

  /**
   * Revokes a single session (standard "log out this device").
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every active session for a user ("log out everywhere").
   * Also used defensively when refresh token reuse is detected.
   */
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private async issueTokenPair(
    userId: string,
    email: string,
    role: JwtPayload['role'],
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
    });

    const rawRefreshToken = crypto
      .randomBytes(REFRESH_TOKEN_BYTES)
      .toString('hex');
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const refreshExpiryDays = Number(
      this.config.get<string>('JWT_REFRESH_EXPIRY_DAYS', '30'),
    );
    const expiresAt = new Date(
      Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  /**
   * We hash refresh tokens with SHA-256, not bcrypt, before storing them.
   * Unlike passwords, refresh tokens are already high-entropy random values
   * (64 bytes), so there's no offline brute-force risk to defend against
   * with a slow hash — SHA-256 is fast and sufficient, and lets lookups
   * use a plain unique index (bcrypt hashes can't be looked up this way,
   * since bcrypt output differs on every call even for the same input).
   */
  private hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}