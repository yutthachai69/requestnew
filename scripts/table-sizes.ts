import 'dotenv/config';
import { prisma } from '../lib/prisma';

(async () => {
  const rows = await prisma.$queryRawUnsafe<{ name: string; rows: number; mb: number }[]>(`
    SELECT t.name AS name,
           SUM(p.rows) AS rows,
           CAST(SUM(a.total_pages) * 8.0 / 1024 AS DECIMAL(10,1)) AS mb
    FROM sys.tables t
    JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
    JOIN sys.allocation_units a ON a.container_id = p.partition_id
    GROUP BY t.name
    HAVING SUM(p.rows) > 0
    ORDER BY SUM(p.rows) DESC
  `);
  for (const r of rows) console.log(`  ${String(r.name).padEnd(28)} ${String(r.rows).padStart(9)} rows  ${r.mb} MB`);
  process.exit(0);
})();
