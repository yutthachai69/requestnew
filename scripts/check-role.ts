
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';

const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db');
const url = `file:${sqlitePath.replace(/\\/g, '/')}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- All Roles ---');
    const roles = await prisma.role.findMany();
    roles.forEach(r => console.log(`ID: ${r.id}, Name: "${r.roleName}"`));

    console.log('\n--- User ID 2 ---');
    const user = await prisma.user.findUnique({
        where: { id: 2 },
        include: { role: true }
    });
    if (user) {
        console.log(`User: ${user.username}, Role: "${user.role.roleName}"`);
    } else {
        console.log('User ID 2 not found');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
