import { prisma } from '../lib/prisma';

async function main() {
    console.log('🔍 Verifying Seed Data...');

    // Check Departments
    const departments = await prisma.department.findMany();
    console.log(`\n🏢 Departments (${departments.length}):`);
    departments.forEach(d => console.log(` - ${d.name} (Active: ${d.isActive})`));

    // Check Users
    const users = await prisma.user.findMany({
        include: { role: true, department: true }
    });
    console.log(`\n👤 Users (${users.length}):`);
    users.forEach(u => {
        console.log(` - ${u.username} (${u.role.roleName}) - ${u.department?.name || 'No Dept'}`);
    });

    // Check Categories
    const categories = await prisma.category.findMany();
    console.log(`\n📂 Categories (${categories.length}):`);
    categories.forEach(c => console.log(` - ${c.name}`));

}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
