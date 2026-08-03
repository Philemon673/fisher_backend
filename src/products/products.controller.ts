import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Public route, but detects whether the caller is an authenticated
   * admin so an admin browsing the same endpoint (e.g. from a dashboard
   * "storefront preview") can still see unpublished items if they ask
   * for them via includeUnpublished. No guard here — a missing/invalid
   * token just means isAdminRequest is false, not a 401.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: QueryProductsDto, @Req() req: Request) {
    const isAdminRequest = this.isRequestingAdmin(req);
    return this.productsService.findAll(query, isAdminRequest);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.productsService.updateStock(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  /**
   * Lightweight admin check that doesn't reject the request if it fails —
   * this endpoint stays public either way. A real admin session simply
   * unlocks the includeUnpublished query option.
   */
  private isRequestingAdmin(req: Request): boolean {
    const user = (req as Request & { user?: { role?: Role } }).user;
    return user?.role === Role.ADMIN;
  }
}
