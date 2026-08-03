import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v2 as CloudinaryType, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { CLOUDINARY_PROVIDER } from './cloudinary.provider';
import type { UploadResult } from './upload-result.interface';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(CLOUDINARY_PROVIDER) private readonly cloudinary: typeof CloudinaryType,
  ) {}

  async uploadImage(file: Express.Multer.File, folder: string): Promise<UploadResult> {
    this.validateFile(file, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, 'image');
    return this.streamUpload(file, folder, 'image');
  }

  async uploadVideo(file: Express.Multer.File, folder: string): Promise<UploadResult> {
    this.validateFile(file, ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, 'video');
    return this.streamUpload(file, folder, 'video');
  }

  /**
   * Removes a file from Cloudinary given its public_id. Callers (e.g.
   * ProductsService when deleting a ProductImage row) should call this
   * BEFORE removing the corresponding database row, so a failed Cloudinary
   * deletion doesn't leave you with an orphaned DB reference to a URL
   * that was never actually cleaned up.
   */
  async delete(publicId: string, resourceType: 'image' | 'video'): Promise<void> {
    try {
      await this.cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      this.logger.error(`Failed to delete Cloudinary asset ${publicId}`, error);
      throw new InternalServerErrorException('Failed to delete media asset');
    }
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  private validateFile(
    file: Express.Multer.File | undefined,
    allowedTypes: string[],
    maxBytes: number,
    label: string,
  ): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid ${label} type "${file.mimetype}". Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    if (file.size > maxBytes) {
      throw new BadRequestException(
        `${label} exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`,
      );
    }
  }

  private streamUpload(
    file: Express.Multer.File,
    folder: string,
    resourceType: 'image' | 'video',
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          // Cloudinary auto-generates a unique public_id if we don't set one —
          // avoids collisions between products with similar filenames.
        },
        (error: UploadApiErrorResponse | undefined, result?: UploadApiResponse) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(new InternalServerErrorException('Failed to upload media'));
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            resourceType,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            duration: result.duration,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }
}