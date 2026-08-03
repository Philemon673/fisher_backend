import {
  Body,
  Controller,
  Delete,
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
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Controller()
@UseGuards(JwtAuthGuard) // every route in this controller requires a logged-in user by default
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  
  // Own profile
  

  @Get('users/me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.id);
  }

  @Patch('users/me')
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  
  // Own addresses
  

  @Get('users/me/addresses')
  listMyAddresses(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listAddresses(user.id);
  }

  @Post('users/me/addresses')
  createMyAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.usersService.createAddress(user.id, dto);
  }

  @Patch('users/me/addresses/:addressId')
  updateMyAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(user.id, addressId, dto);
  }

  @Delete('users/me/addresses/:addressId')
  deleteMyAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('addressId') addressId: string,
  ) {
    return this.usersService.deleteAddress(user.id, addressId);
  }

  
  // Admin
  

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listAllUsers(@Query() query: PaginationQueryDto) {
    return this.usersService.findAllForAdmin(query);
  }

  @Get('admin/users/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getUserById(@Param('userId') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('admin/users/:userId/deactivate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  deactivateUser(@Param('userId') userId: string) {
    return this.usersService.setActiveStatus(userId, false);
  }

  @Patch('admin/users/:userId/reactivate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reactivateUser(@Param('userId') userId: string) {
    return this.usersService.setActiveStatus(userId, true);
  }
}