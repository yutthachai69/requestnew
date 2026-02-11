
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // @ts-ignore
    const logs = await prisma.auditLog.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' },
        include: { user: true }
    });

    console.log('--- Latest Audit Logs ---');
    logs.forEach((log: any) => {
        console.log(`[${log.timestamp.toISOString()}] Action: ${log.action} | User: ${log.user?.fullName} | Detail: ${log.detail}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
