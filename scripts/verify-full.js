const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Connecting to Database...');
    console.log(`📡 URL: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')}`); // Hide password in log

    try {
        await prisma.$connect();
        console.log('✅ Authentication Successful!');

        const userCount = await prisma.user.count();
        console.log(`📊 Found ${userCount} users in the database.`);

        const admin = await prisma.user.findFirst({ where: { username: 'admin' } });
        if (admin) {
            console.log('👤 Admin user found:', admin.username);
        } else {
            console.log('⚠️ Admin user NOT found.');
        }

    } catch (e) {
        console.error('❌ Connection Failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
