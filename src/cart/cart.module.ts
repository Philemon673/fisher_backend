import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService], // orders/ will call cartService.clear() after checkout succeeds
})
export class CartModule {}