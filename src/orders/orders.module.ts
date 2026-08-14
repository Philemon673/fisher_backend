import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notification/notifications.module';
import { MailModule } from '../mail/mail.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}