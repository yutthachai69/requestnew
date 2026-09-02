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
    // ค่า default ของ mssql คือ pool.max = 10 ซึ่งตื้นเกินไปสำหรับผู้ใช้พร้อมกัน
    // หลายสิบคน: เมื่อ connection เต็ม คำขอถัดไปจะรอจน timeout แล้วโยน
    // "Failed to connect ... in 15000ms" ซึ่งอ่านแล้วเข้าใจผิดว่า DB ล่ม
    // ตั้งผ่าน env ได้เพื่อจูนตอน load test / production โดยไม่ต้องแก้โค้ด
    pool: {
      max: Number(process.env.MSSQL_POOL_MAX ?? 25),
      min: Number(process.env.MSSQL_POOL_MIN ?? 2),
      // เก็บ connection ว่างไว้ 5 นาที (default 30 วินาที) ลดการสร้าง/ปิด
      // connection ซ้ำ ๆ ระหว่างช่วงที่มีคนใช้งานต่อเนื่อง
      idleTimeoutMillis: Number(process.env.MSSQL_POOL_IDLE_MS ?? 300_000),
      acquireTimeoutMillis: Number(process.env.MSSQL_POOL_ACQUIRE_MS ?? 30_000),
    },
    connectionTimeout: Number(process.env.MSSQL_CONNECTION_TIMEOUT_MS ?? 15_000),
    // query แรกที่ยิงใส่ตารางใหญ่หลังรีสตาร์ท (buffer pool ยังว่าง) อาจใช้เวลา
    // นานกว่า 15 วินาทีที่เป็นค่า default — ขยายไว้กันผู้ใช้กลุ่มแรกเจอ error
    requestTimeout: Number(process.env.MSSQL_REQUEST_TIMEOUT_MS ?? 30_000),
  };
}
