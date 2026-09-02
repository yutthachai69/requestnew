/**
 * รันเทสที่ต้องใช้ฐานข้อมูลจริง (ข้ามโดยปริยายใน `npm test`)
 * แยกเป็นไฟล์เพราะการตั้ง env inline ใช้ไม่ได้เหมือนกันทุก shell บน Windows
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'lib/document-number.db.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, RUN_DB_TESTS: 'true' },
});
process.exit(result.status ?? 1);
