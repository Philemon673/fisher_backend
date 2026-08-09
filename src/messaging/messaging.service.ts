import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationStatus, Role } from '@prisma/client';
import Pusher from 'pusher';
import { PrismaService } from '../../prisma/prisma.service';
import { SendMessageDto } from './dto/message.dto';

@Injectable()
export class MessagingService {
    private readonly pusher: Pusher;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {
        this.pusher = new Pusher({
            appId: this.config.getOrThrow<string>('PUSHER_APP_ID'),
            key: this.config.getOrThrow<string>('PUSHER_KEY'),
            secret: this.config.getOrThrow<string>('PUSHER_SECRET'),
            cluster: this.config.getOrThrow<string>('PUSHER_CLUSTER'),
            useTLS: true,
        });
    }

    /**
     * Reuses an existing OPEN conversation for this customer if one exists,
     * rather than spawning a new thread every time they open the chat
     * widget. Keeps support history in one continuous thread until an
     * admin explicitly closes it.
     */
    async startOrGetConversation(customerId: string) {
        const existing = await this.prisma.conversation.findFirst({
            where: { customerId, status: ConversationStatus.OPEN },
            orderBy: { createdAt: 'desc' },
        });

        if (existing) return existing;

        return this.prisma.conversation.create({
            data: { customerId },
        });
    }

    async listForCustomer(customerId: string) {
        return this.prisma.conversation.findMany({
            where: { customerId },
            include: this.conversationInclude(),
            orderBy: { updatedAt: 'desc' },
        });
    }

    /**
     * Admin sees everything by default; unclaimedOnly narrows to
     * conversations no admin has picked up yet — useful for a queue view.
     */
    async listForAdmin(unclaimedOnly = false) {
        return this.prisma.conversation.findMany({
            where: unclaimedOnly ? { adminId: null, status: ConversationStatus.OPEN } : {},
            include: this.conversationInclude(),
            orderBy: { updatedAt: 'desc' },
        });
    }

    async claim(adminId: string, conversationId: string) {
        await this.ensureConversationExists(conversationId);

        return this.prisma.conversation.update({
            where: { id: conversationId },
            data: { adminId },
            include: this.conversationInclude(),
        });
    }

    async close(conversationId: string) {
        await this.ensureConversationExists(conversationId);

        return this.prisma.conversation.update({
            where: { id: conversationId },
            data: { status: ConversationStatus.CLOSED },
        });
    }

    /**
     * Persists the message, then broadcasts it over the conversation's
     * private Pusher channel so anyone currently subscribed (customer,
     * claimed admin) sees it appear live without polling. If the sender
     * is an admin and the conversation is unclaimed, auto-claims it —
     * the first admin to reply owns the thread.
     */
    async sendMessage(
        senderId: string,
        senderRole: Role,
        conversationId: string,
        dto: SendMessageDto,
    ) {
        const conversation = await this.ensureAccess(senderId, senderRole, conversationId);

        if (senderRole === Role.ADMIN && !conversation.adminId) {
            await this.prisma.conversation.update({
                where: { id: conversationId },
                data: { adminId: senderId },
            });
        }

        const message = await this.prisma.message.create({
            data: { conversationId, senderId, content: dto.content },
            include: { sender: { select: { id: true, name: true, avatarUrl: true, role: true } } },
        });

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        await this.pusher.trigger(
            this.channelName(conversationId),
            'new-message',
            message,
        );

        return message;
    }

    async listMessages(userId: string, role: Role, conversationId: string) {
        await this.ensureAccess(userId, role, conversationId);

        return this.prisma.message.findMany({
            where: { conversationId },
            include: { sender: { select: { id: true, name: true, avatarUrl: true, role: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Authorizes a client to subscribe to a private Pusher channel. This is
     * what your POST /pusher/auth endpoint calls — without it, Pusher's
     * client SDK gets a 403 and the subscription silently never connects.
     * Critically: we re-verify the requester actually has access to this
     * specific conversation before signing — never trust the channel_name
     * the client claims to want blindly.
     */
    async authorizeChannel(
        userId: string,
        role: Role,
        socketId: string,
        channelName: string,
    ) {
        const conversationId = this.extractConversationId(channelName);
        await this.ensureAccess(userId, role, conversationId);

        return this.pusher.authorizeChannel(socketId, channelName);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    private async ensureConversationExists(conversationId: string) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }
        return conversation;
    }

    /**
     * Customers may only access their own conversation; admins may access
     * any. Returns the conversation so callers avoid a second query.
     */
    private async ensureAccess(userId: string, role: Role, conversationId: string) {
        const conversation = await this.ensureConversationExists(conversationId);

        if (role !== Role.ADMIN && conversation.customerId !== userId) {
            throw new ForbiddenException('You do not have access to this conversation');
        }

        return conversation;
    }

    private channelName(conversationId: string): string {
        return `private-conversation-${conversationId}`;
    }

    private extractConversationId(channelName: string): string {
        const id = channelName.replace('private-conversation-', '');
        if (!id || id === channelName) {
            throw new ForbiddenException('Invalid channel name');
        }
        return id;
    }

    private conversationInclude() {
        return {
            customer: { select: { id: true, name: true, email: true, avatarUrl: true } },
            admin: { select: { id: true, name: true, avatarUrl: true } },
            _count: { select: { messages: true } },
        };
    }
}