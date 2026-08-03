import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  // Without this, every @Body() DTO across your app (UpdateUserDto,
  // CreateAddressDto, etc.) is validated in name only — class-validator
  // decorators do nothing until this pipe is registered.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips any property not declared in the DTO
      forbidNonWhitelisted: true, // rejects requests containing extra/unexpected fields
      transform: true, // converts plain JSON into actual DTO class instances (needed for @Type() in PaginationQueryDto)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Required because your frontend runs on a different origin than your
  // API, and the refresh-token cookie is httpOnly + credentialed —
  // without this, the browser will silently block the cookie from
  // ever being sent or received.
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();