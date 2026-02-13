/**
 * Simple in-memory rate limiter (ไม่ต้อง install package เพิ่ม)
 * ใช้ sliding window counter pattern
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// ทำความสะอาด entries ที่หมดอายุทุก 5 นาที
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key);
    }
}, 5 * 60 * 1000);

interface RateLimitOptions {
    /** จำนวนครั้งสูงสุดที่อนุญาตต่อ window */
    maxRequests: number;
    /** ขนาด window เป็นวินาที */
    windowSec: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

/**
 * ตรวจสอบ rate limit สำหรับ key ที่กำหนด
 * @param key - identifier เช่น IP + route path
 * @param options - จำนวนครั้งและขนาด window
 * @returns ผลลัพธ์ว่าผ่านหรือไม่ พร้อมจำนวนที่เหลือ
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    // ถ้าไม่เคยมี หรือ window หมดอายุแล้ว → สร้างใหม่
    if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + options.windowSec * 1000 });
        return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowSec * 1000 };
    }

    // ยังอยู่ใน window เดิม
    entry.count++;
    if (entry.count > options.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: options.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * สร้าง key จาก IP + path สำหรับ rate limiting
 */
export function getRateLimitKey(ip: string | null, path: string): string {
    return `${ip ?? 'unknown'}:${path}`;
}
