/**
 * ตรวจสุขภาพระบบสำหรับตัวเฝ้าภายนอก (monitoring)
 *
 * หลักการ: ต้องตรวจ "ของจริง" ไม่ใช่แค่ตอบ 200 กลับไป
 * endpoint ที่ตอบ 200 ได้ทั้งที่ฐานข้อมูลล่ม คือ endpoint ที่ทำให้เข้าใจผิดว่า
 * ระบบยังดีอยู่ — อันตรายกว่าไม่มีเลย
 */

export type HealthCheck = {
  ok: boolean;
  latencyMs: number;
  /** เหตุผลเมื่อไม่ผ่าน — ข้อความสั้น ไม่เปิดเผยรายละเอียดระบบ */
  error?: string;
};

export type HealthReport = {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  checks: { database: HealthCheck };
};

/** เวลาสูงสุดที่ยอมรอฐานข้อมูล — นานกว่านี้ถือว่าใช้งานไม่ได้แล้ว */
export const DB_CHECK_TIMEOUT_MS = Number(process.env.HEALTH_DB_TIMEOUT_MS ?? 5000);

/**
 * ยิง query ที่ถูกที่สุดเท่าที่จะทำได้เพื่อพิสูจน์ว่าต่อฐานข้อมูลได้จริง
 * และไม่ปล่อยให้ค้างนานจนตัวเฝ้า timeout ไปเอง
 */
export async function checkDatabase(
  query: () => Promise<unknown>,
  timeoutMs = DB_CHECK_TIMEOUT_MS
): Promise<HealthCheck> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      query(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      // ข้อความจาก driver อาจมีชื่อเซิร์ฟเวอร์/ผู้ใช้ จึงตัดให้สั้นและไม่ให้รายละเอียด
      error: e instanceof Error && e.message.includes('timeout') ? 'timeout' : 'unreachable',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildHealthReport(database: HealthCheck, uptimeSeconds: number): HealthReport {
  return {
    status: database.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(uptimeSeconds),
    checks: { database },
  };
}

/** 200 เมื่อใช้งานได้ / 503 เมื่อใช้งานไม่ได้ — ตัวเฝ้าทั่วไปเข้าใจสองค่านี้ */
export function healthStatusCode(report: HealthReport): number {
  return report.status === 'ok' ? 200 : 503;
}
