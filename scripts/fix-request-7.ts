
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Fixing Request ID 7...');

    // Find "CLOSED" status ID
    const closedStatus = await prisma.status.findUnique({ where: { code: 'CLOSED' } });
    if (!closedStatus) {
        console.error('Status CLOSED not found');
        return;
    }

    await prisma.iTRequestF07.update({
        where: { id: 7 },
        data: {
            status: 'CLOSED',
            currentStatusId: closedStatus.id,
            approvalToken: null,
            updatedAt: new Date()
        }
    });

    console.log(`✅ Request ID 7 manually updated to CLOSED (Status ID: ${closedStatus.id})`);
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
