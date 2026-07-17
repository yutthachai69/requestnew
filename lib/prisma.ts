import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { getMssqlConfig } from '@/lib/mssql-config';

// Singleton pattern for Prisma Client (SQL Server via @prisma/adapter-mssql)
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaMssql(getMssqlConfig()) });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
