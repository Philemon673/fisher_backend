import { IsEnum, IsString } from 'class-validator';
import { Platform } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  token: string; // Pusher Beams device/interest identifier from the client SDK

  @IsEnum(Platform)
  platform: Platform;
}