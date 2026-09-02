/**
 * เปิด READ_COMMITTED_SNAPSHOT เพื่อไม่ให้การอ่านถูกบล็อกโดย transaction ที่กำลังเขียน
 *
 * ต้องรันบน connection ที่ไม่ได้ต่อกับฐานข้อมูลเป้าหมาย และต้องตัด connection อื่น
 * ชั่วขณะ (ROLLBACK IMMEDIATE) จึงควรทำในช่วงที่ไม่มีผู้ใช้งาน
 */
import 'dotenv/config';
import sql from 'mssql';
import { getMssqlConfig } from '../lib/mssql-config';

async function main() {
  const target = process.env.MSSQL_DATABASE ?? 'requestonline';
  const off = process.argv.includes('--off');
  // ต่อเข้า master เพราะ ALTER DATABASE ทำจากภายในฐานข้อมูลตัวเองไม่ได้
  const pool = await sql.connect({ ...getMssqlConfig(), database: 'master' });
  try {
    await pool
      .request()
      .query(
        `ALTER DATABASE [${target}] SET READ_COMMITTED_SNAPSHOT ${off ? 'OFF' : 'ON'} WITH ROLLBACK IMMEDIATE`
      );
    const result = await pool
      .request()
      .query(
        `SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = '${target}'`
      );
    console.log(`READ_COMMITTED_SNAPSHOT = ${result.recordset[0].is_read_committed_snapshot_on ? 'ON' : 'OFF'}`);
  } finally {
    await pool.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
  });
