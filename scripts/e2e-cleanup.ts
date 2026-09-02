/**
 * Remove throwaway `e2e_*` accounts left behind by the Playwright suites.
 * Deletes the ones with no referencing rows; deactivates the rest (a user that
 * has written an AuditLog row cannot be deleted — FK `AuditLog_userId_fkey`).
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: 'e2e_' } },
    select: { id: true, username: true },
    orderBy: { id: 'asc' },
  });

  let deleted = 0;
  let deactivated = 0;
  for (const user of users) {
    try {
      await prisma.user.delete({ where: { id: user.id } });
      deleted += 1;
    } catch {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      deactivated += 1;
    }
  }

  const remainingActive = await prisma.user.count({
    where: { username: { startsWith: 'e2e_' }, isActive: true },
  });
  console.log(`deleted=${deleted} deactivated=${deactivated} remainingActive=${remainingActive}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
  });
