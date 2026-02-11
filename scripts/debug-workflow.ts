
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';

const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db');
const url = `file:${sqlitePath.replace(/\\/g, '/')}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Requests ---');
    const requests = await prisma.iTRequestF07.findMany({
        include: { currentStatus: true, approvalHistory: true }
    });

    if (requests.length === 0) {
        console.log('No requests found.');
    }

    for (const r of requests) {
        console.log(`ID: ${r.id}, Status: ${r.currentStatus.code} (${r.currentStatus.displayName})`);
        console.log('History:');
        r.approvalHistory.forEach(h => {
            console.log(`  - Step: ${h.approvalLevel}, Action: ${h.actionType}, By: ${h.approverId}, Time: ${h.approvalTimestamp}`);
        });
    }

    console.log('\n--- Workflow Transitions (General) ---');
    const transitions = await prisma.workflowTransition.findMany({
        include: { currentStatus: true, nextStatus: true, requiredRole: true, action: true }
    });
    transitions.forEach(t => {
        console.log(`${t.currentStatus.code} + ${t.action.actionName} (by ${t.requiredRole.roleName}) -> ${t.nextStatus.code}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
