/**
 * รันชุด E2E ให้ครบวงจรในคำสั่งเดียว — ใช้ได้ทั้ง PowerShell, cmd และ bash
 *
 *   npm run test:e2e                          # ทั้งชุด
 *   npm run test:e2e -- --grep "token"        # เฉพาะเคสที่ชื่อตรง
 *   npm run test:e2e -- tests/e2e/mobile.spec.js
 *
 * สคริปต์นี้จัดการให้เอง:
 *   1. เปิด email sink ที่ 127.0.0.1:4010 เพื่อไม่ให้ส่งเมลจริงออกไปข้างนอก
 *   2. ตั้ง env ที่เทสต้องใช้ (RUN_MUTATION_TESTS, TEST_PASSWORD, ...)
 *   3. รัน Playwright
 *   4. ปิด sink ให้เรียบร้อยไม่ว่าเทสจะผ่านหรือไม่
 *
 * ปรับค่าได้ด้วย env เดิมถ้าต้องการ เช่น TEST_PASSWORD ที่ไม่ใช่ค่า seed
 */
import { spawn, spawnSync } from 'node:child_process';
import { Socket } from 'node:net';

const SINK_PORT = Number(process.env.TEST_EMAIL_SINK_PORT ?? 4010);

/**
 * ตรวจว่ามีอะไรฟังอยู่ที่พอร์ตไหม โดย "ลองต่อจริง"
 * (การลอง bind ไม่แม่นบน Windows — bind 127.0.0.1 สำเร็จได้ทั้งที่มีโปรเซสอื่น
 * ฟังอยู่ที่ 0.0.0.0 พอร์ตเดียวกัน)
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function main() {
  // เมื่อชี้ไปเซิร์ฟเวอร์ที่เปิดไว้แล้ว (TEST_BASE_URL) Playwright จะไม่เปิดเอง
  // จึงไม่ต้องกันพอร์ตชน — เช่น ตอนซ้อมกู้ที่รันแอปด้วยฐานข้อมูลอื่น
  if (!process.env.TEST_BASE_URL && (await portInUse(3000))) {
    console.error(
      'พอร์ต 3000 ถูกใช้อยู่ — ปิดเซิร์ฟเวอร์ที่ค้างก่อน (npx kill-port 3000) แล้วรันใหม่'
    );
    process.exit(1);
  }

  let sink = null;
  if (await portInUse(SINK_PORT)) {
    console.log(`ใช้ email sink ที่เปิดอยู่แล้วที่พอร์ต ${SINK_PORT}`);
  } else {
    sink = spawn(process.execPath, ['scripts/test-email-sink.mjs'], {
      stdio: 'ignore',
      env: process.env,
    });
    // ให้เวลา sink เปิดพอร์ต
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`เปิด email sink ที่พอร์ต ${SINK_PORT} แล้ว (ไม่มีเมลออกไปข้างนอก)`);
  }

  const passthrough = process.argv.slice(2);
  // เรียก CLI ของ Playwright ด้วย node ตรง ๆ — ไม่ผ่าน npx/shell เพื่อให้
  // argument ที่มีช่องว่าง (เช่น --grep "สองคำ") ไม่ถูกแยก และทำงานเหมือนกัน
  // ทั้ง PowerShell, cmd และ bash
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...passthrough], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      INTERNAL_EMAIL_API_URL: `http://127.0.0.1:${SINK_PORT}/send`,
      RUN_MUTATION_TESTS: process.env.RUN_MUTATION_TESTS ?? 'true',
      TEST_PASSWORD: process.env.TEST_PASSWORD ?? '1234',
    },
  });

  sink?.kill();
  process.exit(result.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
