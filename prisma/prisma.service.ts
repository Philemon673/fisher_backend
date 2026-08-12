import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Use a pg.Pool (not a raw connectionString config) so that Prisma has a
    // proper connection pool to draw from. Passing a bare config object
    // internally creates a single pg.Client that gets reused across concurrent
    // queries, which triggers the pg DeprecationWarning about calling
    // client.query() while a query is already in progress.
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
    });

    const adapter = new PrismaPg(pool);

    // Pass the driver adapter so Prisma uses the pg pool instead of the
    // default Node.js driver. Required when @prisma/adapter-pg is in use.
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}