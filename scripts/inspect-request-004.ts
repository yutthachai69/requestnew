
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Inspecting Request IT-F07-MA-69-004...');

    const req = await prisma.iTRequestF07.findUnique({
        where: { workOrderNo: 'IT-F07-MA-69-004' },
        include: {
            currentStatus: true,
            approvalHistory: true,
            auditLogs: {
                orderBy: { timestamp: 'desc' },
                take: 5
            }
        }
    });

    if (!req) {
        console.log('Request not found by WorkOrderNo. Trying ID 4...');
        const reqById = await prisma.iTRequestF07.findUnique({
            where: { id: 4 },
            include: {
                currentStatus: true,
                approvalHistory: true,
                auditLogs: {
                    orderBy: { timestamp: 'desc' },
                    take: 5
                }
            }
        });
        if (reqById) {
            console.log('Found ID 4:', reqById.workOrderNo);
            console.log({
                id: reqById.id,
                status: reqById.status,
                currentStatusId: reqById.currentStatusId,
                currentStatus: reqById.currentStatus,
                historyCount: reqById.approvalHistory.length,
                latestLogs: reqById.auditLogs.map(l => `${l.action} - ${l.detail}`)
            });
        } else {
            console.log('ID 4 not found either.');
        }
        return;
    }

    console.log({
        id: req.id,
        workOrderNo: req.workOrderNo,
        status: req.status,
        currentStatusId: req.currentStatusId,
        currentStatus: req.currentStatus,
        historyCount: req.approvalHistory.length,
        latestLogs: req.auditLogs.map(l => `${l.action} - ${l.detail}`)
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
