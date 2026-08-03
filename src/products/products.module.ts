import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [UploadsModule], // needed so ProductsService can inject UploadsService
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService], // cart/, wishlist/, orders/ will all need to look up products
})
export class ProductsModule {}