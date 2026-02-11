/**
 * ดาวน์โหลด Noto Sans Thai Regular (.ttf) ไว้ที่ lib/fonts/
 * ใช้สำหรับสร้าง PDF ที่มีข้อความไทย (api/requests/[id]/pdf)
 *
 * รัน: npm run download-thai-font
 */
import * as fs from 'fs';
import * as path from 'path';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/@electron-fonts/noto-sans-thai@1.2.0/fonts/NotoSansThai-Regular.ttf';

const OUT_DIR = path.join(process.cwd(), 'lib', 'fonts');
const OUT_FILE = path.join(OUT_DIR, 'NotoSansThai-Regular.ttf');

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  console.log('Downloading from:', FONT_URL);
  const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Downloaded file too small');
  fs.writeFileSync(OUT_FILE, buffer);
  console.log('Saved to:', OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
