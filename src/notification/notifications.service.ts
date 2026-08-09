import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PushNotifications from '@pusher/push-notifications-server';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly beamsClient: PushNotifications;

    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.beamsClient = new PushNotifications({
            instanceId: this.config.getOrThrow<string>('PUSHER_BEAMS_INSTANCE_ID'),
            secretKey: this.config.getOrThrow<string>('PUSHER_BEAMS_SECRET_KEY'),
        });
    }

    /**
     * Persists the device's push token so it's visible for admin/debugging
     * purposes. Note: the actual interest subscription (device <-> interest
     * "user-{userId}") happens client-side via the Beams JS/mobile SDK when
     * the frontend calls beamsClient.setUserId() or addDeviceInterest() —
     * this DB row is a record of that, not what makes delivery work.
     */
    async registerDevice(userId: string, dto: RegisterDeviceDto) {
        return this.prisma.deviceToken.upsert({
            where: { token: dto.token },
            create: { userId, token: dto.token, platform: dto.platform },
            update: { userId, platform: dto.platform }, // token re-registered, possibly to a different user (shared device)
        });
    }

    async unregisterDevice(token: string): Promise<void> {
        await this.prisma.deviceToken.deleteMany({ where: { token } });
    }

    /**
     * Publishes a push notification to every device subscribed to a
     * specific user's interest. Failures are logged, not thrown — a
     * failed push notification should never roll back or block the
     * business action that triggered it (e.g. an order was successfully
     * placed even if the push happened to fail).
     */
    async notifyUser(userId: string, payload: NotificationPayload): Promise<void> {
        try {
            await this.beamsClient.publishToInterests([`user-${userId}`], {
                web: {
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                    data: payload.data,
                },
                fcm: {
                    notification: { title: payload.title, body: payload.body },
                    data: payload.data,
                },
                apns: {
                    aps: { alert: { title: payload.title, body: payload.body } },
                    data: payload.data,
                },
            });
        } catch (error) {
            this.logger.error(`Failed to push notification to user ${userId}`, error);
        }
    }

    /**
     * Broadcasts to every device subscribed to the "admins" interest —
     * used for things like "new order placed" alerts to whoever's staffing
     * the dashboard. Admin clients subscribe to this interest client-side
     * the same way user-specific ones work.
     */
    async notifyAdmins(payload: NotificationPayload): Promise<void> {
        try {
            await this.beamsClient.publishToInterests(['admins'], {
                web: { notification: { title: payload.title, body: payload.body }, data: payload.data },
                fcm: { notification: { title: payload.title, body: payload.body }, data: payload.data },
                apns: {
                    aps: { alert: { title: payload.title, body: payload.body } },
                    data: payload.data,
                },
            });
        } catch (error) {
            this.logger.error('Failed to push notification to admins', error);
        }
    }
}