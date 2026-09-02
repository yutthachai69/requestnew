import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { getMssqlConfig } from '@/lib/mssql-config';

// Singleton pattern for Prisma Client (SQL Server via @prisma/adapter-mssql)
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

// ตั้ง PRISMA_QUERY_LOG=true เพื่อให้ client ปล่อย event 'query' — ใช้ตอนวัด
// ประสิทธิภาพ/ไล่หา N+1 (scripts/perf-check.ts) โดยไม่กระทบการทำงานปกติ
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaMssql(getMssqlConfig()),
    ...(process.env.PRISMA_QUERY_LOG === 'true'
      ? { log: [{ emit: 'event' as const, level: 'query' as const }] }
      : {}),
  });

// ตั้ง PRISMA_SLOW_QUERY_MS=<ms> เพื่อบันทึก query ที่ใช้เวลานานกว่ากำหนด
// (ต้องเปิด PRISMA_QUERY_LOG=true ด้วย) ใช้ไล่หา query ที่ไปชน requestTimeout
// โดยไม่ต้องเปิด log ทุก query ซึ่งจะท่วมและทำให้ช้าลงไปอีก
const slowQueryMs = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 0);
if (slowQueryMs > 0 && process.env.PRISMA_QUERY_LOG === 'true') {
  (prisma as unknown as {
    $on: (event: 'query', cb: (e: { query: string; params: string; duration: number }) => void) => void;
  }).$on('query', (e) => {
    if (e.duration >= slowQueryMs) {
      console.warn(`[slow-query] ${e.duration}ms :: ${e.query.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
