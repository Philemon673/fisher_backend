import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY_PROVIDER = 'CLOUDINARY';

/**
 * Configures the Cloudinary SDK once, at module init, using values from
 * ConfigService rather than reading process.env directly — keeps all
 * config access consistent with the rest of the app and makes this
 * trivially mockable in tests.
 */
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    return cloudinary;
  },
};