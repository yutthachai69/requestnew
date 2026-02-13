const { PrismaClient } = require('@prisma/client');

async function testConnection(password) {
    const url = `postgresql://postgres:${password}@localhost:5432/requestonline?schema=public`;
    console.log(`Testing with password: ${password}...`);

    // Override directly via environment variable
    process.env.DATABASE_URL = url;

    // Initialize without arguments to avoid ConstructorValidationError
    const prisma = new PrismaClient();

    try {
        await prisma.$connect();
        console.log(`✅ Success! The correct password is: ${password}`);
        await prisma.$disconnect();
        return true;
    } catch (e) {
        // console.log(e); // Debug if needed
        console.log(`❌ Failed with password: ${password}`);
        await prisma.$disconnect();
        return false;
    }
}

async function main() {
    const passwords = ['root', '1234', '123456', 'postgres', 'admin'];

    for (const pwd of passwords) {
        if (await testConnection(pwd)) {
            process.exit(0);
        }
    }
    console.error('❌ All passwords failed.');
    process.exit(1);
}

main();
