import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { GoogleUserPayload } from '../interfaces/google-user.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  /**
   * Called automatically by Passport once Google redirects back with a
   * successful login. We do NOT touch the database here — this strategy's
   * only job is to normalize Google's payload. AuthService decides what
   * to do with it (upsert, issue tokens, etc.).
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(
        new Error('Google account has no accessible email address'),
        false,
      );
    }

    const googleUser: GoogleUserPayload = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? '',
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, googleUser);
  }
}