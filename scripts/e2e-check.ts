import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: 'e2e_' } },
    select: { id: true, username: true, isActive: true },
    orderBy: { id: 'asc' },
  });
  console.log(`e2e_* users: ${users.length} (active: ${users.filter((u) => u.isActive).length})`);

  const requests = await prisma.iTRequestF07.findMany({
    where: { OR: [{ problemDetail: { contains: 'SMOKE TEST' } }, { problemDetail: { contains: 'EDGE TEST' } }] },
    select: { id: true, workOrderNo: true, status: true },
  });
  console.log(`leftover test requests: ${requests.length}`);

  const masterLeftovers = await Promise.all([
    prisma.category.count({ where: { name: { startsWith: 'E2E ' } } }),
    prisma.department.count({ where: { name: { startsWith: 'E2E ' } } }),
    prisma.role.count({ where: { roleName: { startsWith: 'E2E ' } } }),
    prisma.location.count({ where: { name: { startsWith: 'E2E ' } } }),
  ]);
  console.log(`leftover master data (category/department/role/location): ${masterLeftovers.join('/')}`);

  console.log('\n--- environment ---');
  console.log('process TZ  :', Intl.DateTimeFormat().resolvedOptions().timeZone, `(offset ${-new Date().getTimezoneOffset() / 60})`);

  const collation = await prisma.$queryRawUnsafe<{ c: string }[]>(
    "SELECT CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) AS c"
  );
  console.log('DB collation:', collation[0]?.c);

  const cols = await prisma.$queryRawUnsafe<{ t: string; c: string; coll: string | null }[]>(
    `SELECT TOP 8 t.name AS t, c.name AS c, c.collation_name AS coll
     FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
     WHERE t.name IN ('User','ITRequestF07') AND c.collation_name IS NOT NULL
     ORDER BY t.name, c.column_id`
  );
  for (const row of cols) console.log(`  ${row.t}.${row.c} → ${row.coll}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
  });
