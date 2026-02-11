
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';

const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db');
const url = `file:${sqlitePath.replace(/\\/g, '/')}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Roles ---');
    const roles = await prisma.role.findMany();
    roles.forEach(r => console.log(JSON.stringify(r)));

    console.log('--- Users ---');
    const users = await prisma.user.findMany({
        include: { role: true },
    });
    users.forEach(u => {
        console.log(`User: ${u.username}, Role: ${u.role.roleName}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
