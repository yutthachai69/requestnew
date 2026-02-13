const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Cleaning up "Manager" role...');

    try {
        // 1. Find the role to get its ID (if we needed to migrate users, but here we just want to delete)
        const role = await prisma.role.findUnique({
            where: { roleName: 'Manager' }
        });

        if (!role) {
            console.log('Role "Manager" not found. Nothing to delete.');
            return;
        }

        console.log(`Found "Manager" role (ID: ${role.id}). Checking for assigned users...`);

        // 2. Check if any users have this role
        const usersCount = await prisma.user.count({
            where: { roleId: role.id }
        });

        if (usersCount > 0) {
            console.log(`WARNING: There are ${usersCount} users with "Manager" role.`);
            console.log('Migrating them to "Head of Department"...');

            const headRole = await prisma.role.findUnique({ where: { roleName: 'Head of Department' } });
            if (!headRole) {
                throw new Error('Head of Department role not found! Cannot migrate.');
            }

            await prisma.user.updateMany({
                where: { roleId: role.id },
                data: { roleId: headRole.id }
            });
            console.log('Migration completed.');
        }

        // 3. Delete the role
        await prisma.role.delete({
            where: { id: role.id }
        });
        console.log('SUCCESS: "Manager" role deleted.');

    } catch (err) {
        console.error('Error cleaning up role:', err);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
