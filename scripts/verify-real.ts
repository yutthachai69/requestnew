import { prisma } from '../lib/prisma';

async function main() {
    try {
        console.log('🔄 Connecting using app configuration (lib/prisma)...');

        // Test simple query
        const userCount = await prisma.user.count();
        console.log(`✅ Success! Found ${userCount} users.`);

        // Check specific admin user to double check data integrity
        const admin = await prisma.user.findUnique({
            where: { username: 'admin' }
        });

        if (admin) {
            console.log(`👤 Admin found: ${admin.fullName} (${admin.email})`);
        } else {
            console.log('⚠️ Admin user not found (but connection works)');
        }

    } catch (error) {
        console.error('❌ Connection Failed:', error);
        process.exit(1);
    }
}

main();
