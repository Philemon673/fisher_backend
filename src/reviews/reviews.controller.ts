import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

type AuthReq = Request & { user?: AuthenticatedUser };

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ──────────────────────────────────────────
  //  Public: GET /api/reviews[?productId=xxx]
  // ──────────────────────────────────────────
  @Get('reviews')
  findAll(@Query('productId') productId?: string) {
    return this.reviewsService.findAll(productId);
  }

  // ──────────────────────────────────────────
  //  Authenticated: POST /api/reviews
  // ──────────────────────────────────────────
  @Post('reviews')
  @UseGuards(OptionalJwtAuthGuard)
  create(@Body() dto: CreateReviewDto, @Req() req: AuthReq) {
    const userId = req.user?.id ?? undefined;
    return this.reviewsService.create(dto, userId);
  }

  // ──────────────────────────────────────────
  //  Admin only: DELETE /api/reviews/:id
  // ──────────────────────────────────────────
  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }

  // ──────────────────────────────────────────
  //  Public: GET /api/products/:productId/reviews
  // ──────────────────────────────────────────
  @Get('products/:productId/reviews')
  findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findAll(productId);
  }

  // ──────────────────────────────────────────
  //  Authenticated: POST /api/products/:productId/reviews
  // ──────────────────────────────────────────
  @Post('products/:productId/reviews')
  @UseGuards(OptionalJwtAuthGuard)
  createForProduct(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @Req() req: AuthReq,
  ) {
    const userId = req.user?.id ?? undefined;
    return this.reviewsService.create({ ...dto, productId }, userId);
  }

  // ──────────────────────────────────────────
  //  Admin only: DELETE /api/products/:productId/reviews/:id
  // ──────────────────────────────────────────
  @Delete('products/:productId/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  removeForProduct(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}
