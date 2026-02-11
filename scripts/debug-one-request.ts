
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';

const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db');
const url = `file:${sqlitePath.replace(/\\/g, '/')}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
    const request = await prisma.iTRequestF07.findFirst({
        orderBy: { id: 'desc' },
        include: { currentStatus: true, approvalHistory: true }
    });

    if (!request) {
        console.log('No requests found.');
        return;
    }

    console.log(`ID: ${request.id}, Status: ${request.currentStatus.code}`);
    console.log('History:', JSON.stringify(request.approvalHistory, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
