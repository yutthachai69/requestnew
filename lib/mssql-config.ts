import type { config as MssqlConfig } from 'mssql';

/**
 * สร้าง config เชื่อม SQL Server จาก env — ใช้ร่วมกันทั้ง runtime (lib/prisma.ts) และ seed scripts
 * .env:
 *   MSSQL_SERVER, MSSQL_PORT, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD
 */
export function getMssqlConfig(): MssqlConfig {
  return {
    server: process.env.MSSQL_SERVER ?? 'localhost',
    port: Number(process.env.MSSQL_PORT ?? 1433),
    database: process.env.MSSQL_DATABASE ?? 'requestonline',
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: {
      encrypt: true, // SQL Server 2022+ เปิด encryption โดยปริยาย
      trustServerCertificate: true, // dev/on-prem ที่ใช้ self-signed cert
    },
  };
}
