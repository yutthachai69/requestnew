import { describe, expect, it } from 'vitest';
import { fitTextToBox, truncateToWidth, wrapTextToWidth } from './pdf-text';

/** ตัววัดปลอม: ทุกอักขระกว้าง 10 หน่วย — ทำให้คำนวณคาดเดาได้ */
const measure = (text: string) => text.length * 10;

/** ความกว้างจริงของช่องรายละเอียดปัญหาใน PDF (contentWidth * 0.65 - padding) */
const REAL_BOX_WIDTH = (595.28 - 40 * 2) * 0.65 - 12;

describe('wrapTextToWidth', () => {
  it('ตัดบรรทัดไม่ให้เกินความกว้างที่กำหนด', () => {
    const lines = wrapTextToWidth('aaa bbb ccc ddd', 70, measure);
    for (const line of lines) {
      expect(measure(line), `บรรทัด "${line}" กว้างเกิน`).toBeLessThanOrEqual(70);
    }
  });

  it('ตัดข้อความไทยที่ไม่มีช่องว่างได้ (ตัดทีละอักขระ)', () => {
    // ข้อความไทยยาวติดกันแบบที่ผู้ใช้จริงพิมพ์ — ไม่มีช่องว่างให้ตัดเลย
    const thai = 'ระบบขัดข้องไม่สามารถบันทึกข้อมูลได้กรุณาตรวจสอบโดยด่วนที่สุด';
    const lines = wrapTextToWidth(thai, 100, measure);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line), `บรรทัด "${line}" กว้างเกิน`).toBeLessThanOrEqual(100);
    }
    // ต้องไม่มีอักขระหาย
    expect(lines.join('')).toBe(thai);
  });

  it('เคารพการขึ้นบรรทัดใหม่ที่ผู้ใช้พิมพ์เอง', () => {
    expect(wrapTextToWidth('aa\nbb\ncc', 1000, measure)).toEqual(['aa', 'bb', 'cc']);
    // บรรทัดว่างต้องคงไว้ ไม่ยุบหาย
    expect(wrapTextToWidth('aa\n\nbb', 1000, measure)).toEqual(['aa', '', 'bb']);
  });

  it('ไม่ทำให้ช่องว่างไปขึ้นต้นบรรทัดใหม่', () => {
    for (const line of wrapTextToWidth('aaaa bbbb cccc', 50, measure)) {
      expect(line).toBe(line.trimStart());
    }
  });

  it('รับข้อความว่างได้', () => {
    expect(wrapTextToWidth('', 100, measure)).toEqual(['']);
  });

  it('ไม่ทำให้เนื้อหาหายไป', () => {
    const text = 'แจ้งปัญหา ระบบ ERP ล่ม ตั้งแต่เช้า ขอให้ตรวจสอบด่วน';
    // กว้างพอให้ทุกคำอยู่ครบคำ (คำยาวสุด 16 อักขระ = 160 หน่วย)
    // เทียบลำดับคำ — ช่องว่างท้ายบรรทัดถูกตัดออกโดยตั้งใจ
    const words = wrapTextToWidth(text, 200, measure).join(' ').split(/\s+/).filter(Boolean);
    expect(words).toEqual(text.split(/\s+/).filter(Boolean));
  });

  it('ตัดคำที่ยาวเกินหนึ่งบรรทัด แทนที่จะปล่อยให้ทะลุกรอบ', () => {
    // คำเดียวยาว 16 อักขระ แต่บรรทัดรับได้ 12 → ต้องถูกแบ่ง ไม่ใช่ล้นออกไป
    const lines = wrapTextToWidth('ขอให้ตรวจสอบด่วน', 120, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(120);
    expect(lines.join('')).toBe('ขอให้ตรวจสอบด่วน');
  });
});

describe('fitTextToBox', () => {
  it('แยกส่วนที่ใส่ในกรอบได้ ออกจากส่วนที่ล้น', () => {
    const text = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const { lines, overflow } = fitTextToBox(text, 1000, 7, measure);

    expect(lines).toHaveLength(7);
    expect(overflow).toHaveLength(13);
    // รวมกันแล้วต้องครบ ไม่มีอะไรหาย — จุดที่โค้ดเดิมทิ้งเนื้อหาเงียบ ๆ
    expect([...lines, ...overflow].join('\n')).toBe(text);
  });

  it('ไม่มีส่วนล้นเมื่อข้อความสั้นพอ', () => {
    const { lines, overflow } = fitTextToBox('สั้น', 1000, 7, measure);
    expect(lines).toEqual(['สั้น']);
    expect(overflow).toEqual([]);
  });

  it('ข้อความไทยยาวมากต้องล้นออกมา ไม่ใช่ทะลุกรอบ', () => {
    // ย่อหน้าเดียวยาว ๆ แบบที่เคยถูกวาดทะลุขอบกระดาษ
    const long = 'ระบบขัดข้อง'.repeat(120);
    const { lines, overflow } = fitTextToBox(long, REAL_BOX_WIDTH, 7, measure);

    expect(lines).toHaveLength(7);
    expect(overflow.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(REAL_BOX_WIDTH);
    }
  });
});

describe('truncateToWidth', () => {
  it('คืนข้อความเดิมเมื่อไม่เกินความกว้าง', () => {
    expect(truncateToWidth('สั้น', 1000, measure)).toBe('สั้น');
  });

  it('ย่อพร้อมใส่ … และไม่เกินความกว้าง', () => {
    const result = truncateToWidth('ก'.repeat(50), 100, measure);
    expect(result.endsWith('…')).toBe(true);
    expect(measure(result)).toBeLessThanOrEqual(100);
  });

  it('คืนค่าว่างเมื่อแคบจนใส่ … ไม่ได้', () => {
    expect(truncateToWidth('ยาวมาก', 5, measure)).toBe('');
  });
});
