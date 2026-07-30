import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Only needed if the client sends the refresh token in the request body
 * (e.g. a mobile app without cookie support). Web clients using the
 * httpOnly cookie flow implemented in AuthController don't need this at all.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}