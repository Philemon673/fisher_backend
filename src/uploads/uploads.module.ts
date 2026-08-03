import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryProvider } from './cloudinary.provider';

@Module({
  controllers: [UploadsController],
  providers: [CloudinaryProvider, UploadsService],
  exports: [UploadsService], // products/ will call this directly when handling image/video fields on create
})
export class UploadsModule {}