const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- Current Departments ---');
    const depts = await prisma.department.findMany({ select: { id: true, name: true, isActive: true } });
    console.table(depts);

    console.log('\n--- Current Categories ---');
    const cats = await prisma.category.findMany({ select: { id: true, name: true, requiresCCSClosing: true } });
    console.table(cats);

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
