import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { MessagingService } from './messaging.service';
import { SendMessageDto, PusherAuthDto } from './dto/message.dto';

@Controller()
@UseGuards(JwtAuthGuard) // every route requires a logged-in user — chat has no public routes
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  // ─────────────────────────────────────────────
  // Customer
  // ─────────────────────────────────────────────

  @Post('conversations')
  startConversation(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.startOrGetConversation(user.id);
  }

  @Get('conversations')
  listMyConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listForCustomer(user.id);
  }

  // ─────────────────────────────────────────────
  // Messages — shared by both customer and admin, ownership enforced in the service
  // ─────────────────────────────────────────────

  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(user.id, user.role, conversationId, dto);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    return this.messagingService.listMessages(user.id, user.role, conversationId);
  }

  // ─────────────────────────────────────────────
  // Admin
  // ─────────────────────────────────────────────

  @Get('admin/conversations')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listAllConversations(@Query('unclaimedOnly') unclaimedOnly?: string) {
    return this.messagingService.listForAdmin(unclaimedOnly === 'true');
  }

  @Patch('admin/conversations/:id/claim')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  claimConversation(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    return this.messagingService.claim(admin.id, conversationId);
  }

  @Patch('admin/conversations/:id/close')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  closeConversation(@Param('id') conversationId: string) {
    return this.messagingService.close(conversationId);
  }

  // ─────────────────────────────────────────────
  // Pusher channel authorization
  // ─────────────────────────────────────────────

  /**
   * Called automatically by Pusher's client SDK whenever it tries to
   * subscribe to a private-* channel — not something the frontend calls
   * directly. Must stay under whatever authEndpoint the client SDK is
   * configured with. Pusher's client sends this as
   * application/x-www-form-urlencoded by default; ensure your app has
   * urlencoded body parsing enabled (Express has it by default via
   * NestFactory.create, so this typically works out of the box).
   */
  @Post('pusher/auth')
  authorizeChannel(@CurrentUser() user: AuthenticatedUser, @Body() dto: PusherAuthDto) {
    return this.messagingService.authorizeChannel(
      user.id,
      user.role,
      dto.socket_id,
      dto.channel_name,
    );
  }
}