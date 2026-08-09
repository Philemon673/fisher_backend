import {
    Body,
    Get,
    Post,
    Param,
    UseGuards,
    Patch,
    Query,
    Controller
} from '@nestjs/common'
import  { Role } from '@prisma/client'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard'
import { Roles } from 'src/auth/decorators/role.decorator'
import { CurrentUser } from 'src/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface'
import { OrdersService } from './orders.service'
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

@Controller()
@UseGuards(JwtAuthGuard) // every route here requires a logged-in user at minimum
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    //-----------customer ---------------------------------------//

    @Post('orders')
    checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto){
        return this.ordersService.checkout(user.id, dto);
    }

    @Get('orders')
    findMyOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryOrdersDto){
        return this.ordersService.findAllForUser(user.id, query);
    }

    @Get('orders/:id')
    findMyOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return this.ordersService.findOneForUser(user.id, id);
    }

    //-------------------------- Admin -----------------------------------------------------//

    @Get('admin/orders')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    findAllOrders(@Query() query: QueryOrdersDto) {
        return this.ordersService.findAllForAdmin(query);
    }

    @Get('admin/orders/:id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    findOneOrder(@Param('id') id: string ) {
        return this.ordersService.findOneForAdmin(id);
    }

    @Patch('admin/orders/:id/status')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
        return this.ordersService.updateStatus(id, dto);
    }
}
