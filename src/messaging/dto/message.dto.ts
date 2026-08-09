import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/**
 * These field names (socket_id, channel_name) are dictated by Pusher's
 * client SDK — it POSTs exactly this shape (as
 * application/x-www-form-urlencoded by default) to whatever authEndpoint
 * you configure. Keep the snake_case here even though it breaks from
 * the rest of the codebase's camelCase convention, since it must match
 * what Pusher actually sends.
 */
export class PusherAuthDto {
  @IsString()
  socket_id: string;

  @IsString()
  channel_name: string;
}