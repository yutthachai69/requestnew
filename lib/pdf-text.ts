/**
 * ตัดบรรทัดข้อความให้พอดีความกว้างที่กำหนด สำหรับวาดลง PDF
 *
 * เดิมโค้ดสร้าง PDF ใช้แค่ `text.split('\n').slice(0, 7)` ซึ่งมีปัญหา 2 อย่าง:
 *   1. บรรทัดที่ยาวกว่ากรอบถูกวาดออกไปเรื่อย ๆ — pdf-lib ไม่ตัดให้ ข้อความจึง
 *      ทะลุกรอบและทะลุขอบกระดาษ
 *   2. เนื้อหาเกิน 7 บรรทัดหายไปเงียบ ๆ ไม่มีอะไรบอกผู้ใช้
 *
 * ภาษาไทยไม่มีช่องว่างระหว่างคำ การตัดตามช่องว่างอย่างเดียวจึงไม่พอ —
 * ถ้าก้อนข้อความก้อนเดียวกว้างเกินกรอบ ต้องตัดทีละอักขระ
 */

/** วัดความกว้างข้อความ — รับเป็น callback เพื่อให้เทสใส่ตัววัดปลอมได้ */
export type MeasureText = (text: string) => number;

/**
 * ตัดข้อความเป็นบรรทัดที่กว้างไม่เกิน maxWidth
 * เคารพการขึ้นบรรทัดใหม่ (\n) ที่ผู้ใช้พิมพ์มาเอง
 */
export function wrapTextToWidth(text: string, maxWidth: number, measure: MeasureText): string[] {
  if (maxWidth <= 0) return text ? [text] : [];

  const lines: string[] = [];
  for (const paragraph of (text ?? '').split(/\r?\n/)) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    lines.push(...wrapParagraph(paragraph, maxWidth, measure));
  }
  return lines;
}

function wrapParagraph(paragraph: string, maxWidth: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let current = '';

  // ตัดช่องว่างท้ายบรรทัดออก — ไม่งั้นบรรทัดที่ "พอดี" จะกว้างเกินกรอบ
  // เพราะช่องว่างที่มองไม่เห็นถูกนับความกว้างด้วย
  const flush = () => {
    const trimmed = current.replace(/\s+$/, '');
    if (trimmed !== '') lines.push(trimmed);
    current = '';
  };

  // แยกเป็นก้อนโดยเก็บช่องว่างไว้กับก้อนก่อนหน้า เพื่อไม่ให้ช่องว่างขึ้นต้นบรรทัด
  for (const token of paragraph.match(/\S+\s*/g) ?? []) {
    const candidate = current + token;
    if (measure(candidate.trimEnd()) <= maxWidth) {
      current = candidate;
      continue;
    }

    // ก้อนนี้ต่อท้ายบรรทัดเดิมไม่ได้ — ขึ้นบรรทัดใหม่ก่อน
    flush();

    if (measure(token.trimEnd()) <= maxWidth) {
      current = token;
      continue;
    }

    // ก้อนเดียวยังกว้างเกินกรอบ (เช่นข้อความไทยยาว ๆ ที่ไม่มีช่องว่าง) → ตัดทีละอักขระ
    for (const char of token) {
      if (measure(current + char) > maxWidth && current !== '') {
        lines.push(current.replace(/\s+$/, ''));
        current = '';
      }
      current += char;
    }
  }

  flush();
  return lines.length > 0 ? lines : [''];
}

export type FittedText = {
  /** บรรทัดที่วาดได้จริงในพื้นที่ที่มี */
  lines: string[];
  /** บรรทัดที่เกินพื้นที่ — ผู้เรียกต้องเอาไปแสดงต่อ ไม่ใช่ทิ้ง */
  overflow: string[];
};

/**
 * ตัดบรรทัดแล้วแบ่งว่าอะไรใส่ในพื้นที่ maxLines ได้ อะไรล้น
 * (แยกให้ชัดเพื่อไม่ให้เนื้อหาหายเงียบเหมือนเดิม)
 */
export function fitTextToBox(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: MeasureText
): FittedText {
  const all = wrapTextToWidth(text, maxWidth, measure);
  return { lines: all.slice(0, maxLines), overflow: all.slice(maxLines) };
}

/**
 * ย่อข้อความบรรทัดเดียวให้พอดีความกว้าง โดยเติม … ท้าย
 * ใช้กับช่องที่มีที่ว่างบรรทัดเดียว เช่น ชื่อ/แผนก/สถานที่ ซึ่งถ้ายาวเกิน
 * จะไปทับคอลัมน์ถัดไป
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: MeasureText,
  ellipsis = '…'
): string {
  if (measure(text) <= maxWidth) return text;

  const ellipsisWidth = measure(ellipsis);
  if (ellipsisWidth > maxWidth) return '';

  let result = '';
  for (const char of text) {
    if (measure(result + char) + ellipsisWidth > maxWidth) break;
    result += char;
  }
  return result + ellipsis;
}
