import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'phone must be a valid international phone number (e.g. +237123456789)',
  })
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}