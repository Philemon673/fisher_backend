import {
    Get,
    Post,
    Body,
    UseGuards,
    Param,
    Delete,
    Controller
} from '@nestjs/common'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { CurrentUser } from 'src/auth/decorators/current-user.decorator'
import { WishlistService } from './wishlist.service'
import { AddToWishlistDto } from './dto/add-to-wishlist.dto'
import type { AuthenticatedUser } from 'src/auth/interfaces/jwt-payload.interface'


@Controller('wishlist')
@UseGuards(JwtAuthGuard) // a wishlist only ever belong to logged in user
export class WishlistController {
    constructor(private readonly wishlistService: WishlistService){}

    @Get()
    findAll(@CurrentUser() user: AuthenticatedUser){
        return this.wishlistService.findAll(user.id);
    }

    @Post()
    addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddToWishlistDto){
        return this.wishlistService.addItem(user.id, dto);
    }
    @Delete(':id')
    removeItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string){
        return this.wishlistService.removeItem(user.id, id);
    }
}