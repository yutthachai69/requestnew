
const { PrismaClient } = require('../generated/prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Roles ---');
    const roles = await prisma.role.findMany();
    console.table(roles);

    console.log('\n--- Users ---');
    const users = await prisma.user.findMany({
        include: { role: true },
    });
    users.forEach(u => {
        console.log(`${u.username} (${u.email}) - Role: ${u.role.roleName} (ID: ${u.roleId})`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
