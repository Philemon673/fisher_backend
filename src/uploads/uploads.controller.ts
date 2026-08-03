import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { UploadsService } from './uploads.service';

// Files are held in memory (not written to disk) since we immediately
// stream them onward to Cloudinary — no need for temp file cleanup logic.
const memoryStorageConfig = { storage: memoryStorage() };

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // only admins post product media — matches the original requirement
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', memoryStorageConfig))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.uploadImage(file, 'products/images');
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file', memoryStorageConfig))
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.uploadVideo(file, 'products/videos');
  }
}