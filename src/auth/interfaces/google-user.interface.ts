/**
 * Normalized shape we extract from Google's raw profile object.
 * We deliberately narrow this down ourselves in GoogleStrategy rather
 * than passing Google's full, loosely-typed profile further into the app.
 */
export interface GoogleUserPayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}