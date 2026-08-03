export interface UploadResult {
  url: string; // Cloudinary secure_url
  publicId: string; // Cloudinary public_id — required for later deletion/replacement
  resourceType: 'image' | 'video';
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number; // present for video only
}
