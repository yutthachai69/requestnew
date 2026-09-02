import { describe, expect, it } from 'vitest';
import { buildHealthReport, checkDatabase, healthStatusCode } from './health';

describe('checkDatabase', () => {
  it('รายงานว่าใช้งานได้เมื่อ query สำเร็จ', async () => {
    const result = await checkDatabase(async () => [{ ok: 1 }]);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('รายงานว่าใช้งานไม่ได้เมื่อ query ล้มเหลว', async () => {
    const result = await checkDatabase(async () => {
      throw new Error("Login failed for user 'requestapp'");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unreachable');
  });

  it('ไม่เปิดเผยรายละเอียดระบบในข้อความ error', async () => {
    // ข้อความจาก driver มักมีชื่อเซิร์ฟเวอร์/ผู้ใช้ ซึ่ง endpoint นี้เปิดสาธารณะ
    const result = await checkDatabase(async () => {
      throw new Error('Failed to connect to TUSM-PC088:1433 as requestapp');
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('TUSM-PC088');
    expect(JSON.stringify(result)).not.toContain('requestapp');
    expect(JSON.stringify(result)).not.toContain('1433');
  });

  it('ไม่ค้างรอฐานข้อมูลนานเกินกำหนด', async () => {
    // ฐานข้อมูลที่ "ไม่ตอบ" อันตรายกว่าฐานข้อมูลที่ตอบว่าพัง เพราะตัวเฝ้าจะค้างตาม
    const started = Date.now();
    const result = await checkDatabase(() => new Promise(() => {}), 150);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('buildHealthReport / healthStatusCode', () => {
  it('ตอบ 200 เมื่อฐานข้อมูลใช้งานได้', () => {
    const report = buildHealthReport({ ok: true, latencyMs: 3 }, 120.7);
    expect(report.status).toBe('ok');
    expect(report.uptimeSeconds).toBe(121);
    expect(healthStatusCode(report)).toBe(200);
  });

  it('ตอบ 503 เมื่อฐานข้อมูลใช้งานไม่ได้ — ไม่ใช่ 200', () => {
    // จุดสำคัญ: endpoint ที่ตอบ 200 ทั้งที่ DB ล่ม ทำให้เข้าใจผิดว่าระบบยังดี
    const report = buildHealthReport({ ok: false, latencyMs: 5000, error: 'timeout' }, 10);
    expect(report.status).toBe('degraded');
    expect(healthStatusCode(report)).toBe(503);
  });

  it('มีข้อมูลที่ตัวเฝ้าต้องใช้ครบ', () => {
    const report = buildHealthReport({ ok: true, latencyMs: 2 }, 5);
    expect(report).toMatchObject({
      status: 'ok',
      checks: { database: { ok: true } },
    });
    expect(Date.parse(report.timestamp)).not.toBeNaN();
  });
});
