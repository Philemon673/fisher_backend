import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard) // a cart only ever belongs to a logged-in user — no public routes here
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.findAll(user.id);
  }

  @Post()
  addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch(':id')
  updateQuantity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCartDto,
  ) {
    return this.cartService.updateQuantity(user.id, id, dto);
  }

  @Delete(':id')
  removeItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cartService.removeItem(user.id, id);
  }
}