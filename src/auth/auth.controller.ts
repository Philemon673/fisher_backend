import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { GoogleUserPayload } from './interfaces/google-user.interface';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Kicks off the OAuth flow. GoogleAuthGuard intercepts this before the
   * handler body ever runs and redirects the browser to Google's consent
   * screen — this method body never actually executes.
   */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Intentionally empty — GoogleAuthGuard handles the redirect.
  }

  /**
   * Google redirects here after the user grants (or denies) consent.
   * GoogleAuthGuard runs GoogleStrategy.validate() and attaches the
   * normalized profile to request.user before this handler runs.
   */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request & { user: GoogleUserPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.loginWithGoogle(
      req.user,
      {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    );

    this.setRefreshCookie(res, refreshToken);

    // Redirect back to the frontend with the access token as a query param
    // (short-lived, low risk) or, preferably, hand it off via a page that
    // posts it into memory via postMessage. Adjust to match your frontend's
    // actual callback handling.
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    return res.redirect(`${frontendUrl}/auth/callback?accessToken=${accessToken}`);
  }

  /**
   * Exchanges the httpOnly refresh cookie for a new access token,
   * rotating the refresh token in the process.
   */
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      rawRefreshToken,
      { userAgent: req.headers['user-agent'], ipAddress: req.ip },
    );

    this.setRefreshCookie(res, refreshToken);

    return { accessToken };
  }

  /**
   * Logs out the current session only. Requires a valid access token so
   * an attacker can't blind-logout an arbitrary session just by guessing
   * a cookie value.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (rawRefreshToken) {
      await this.authService.logout(rawRefreshToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME);
    return { success: true };
  }

  /**
   * Logs out every session for the current user ("sign out everywhere").
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeAllSessionsForUser(user.id);
    res.clearCookie(REFRESH_COOKIE_NAME);
    return { success: true };
  }

  /**
   * Quick way for the frontend to confirm who's currently logged in.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const refreshExpiryDays = Number(
      this.config.get<string>('JWT_REFRESH_EXPIRY_DAYS', '30'),
    );

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProduction, // requires HTTPS in production
      sameSite: 'lax',
      path: '/auth', // scope the cookie to auth routes only
      maxAge: refreshExpiryDays * 24 * 60 * 60 * 1000,
    });
  }
}