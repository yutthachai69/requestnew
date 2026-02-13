import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/hash';

async function main() {
    const username = 'admin';
    const newPassword = 'admin123';
    const hashedPassword = hashPassword(newPassword);

    console.log(`🔄 Resetting password for user: ${username}`);

    try {
        const user = await prisma.user.update({
            where: { username },
            data: { password: hashedPassword },
        });
        console.log(`✅ Password for ${user.username} has been reset to: ${newPassword}`);
    } catch (error) {
        console.error('❌ Failed to reset password:', error);
    }
}

main();
