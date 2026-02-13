import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Splitting "ฝ่ายไร่/ศูนย์ขนถ่าย" into "เก็บเกี่ยวและขนส่ง" and "ธุรการวัตถุดิบ/ศูนย์ขนถ่าย"...');

    // 1. Rename existing 'ฝ่ายไร่/ศูนย์ขนถ่าย' -> 'เก็บเกี่ยวและขนส่ง'
    const oldCat = await prisma.category.findUnique({ where: { name: 'ฝ่ายไร่/ศูนย์ขนถ่าย' } });

    if (oldCat) {
        console.log(`Renaming Category ID ${oldCat.id} to "เก็บเกี่ยวและขนส่ง"...`);
        await prisma.category.update({
            where: { id: oldCat.id },
            data: { name: 'เก็บเกี่ยวและขนส่ง' }
        });
    } else {
        // Check if already renamed
        const renamed = await prisma.category.findUnique({ where: { name: 'เก็บเกี่ยวและขนส่ง' } });
        if (renamed) {
            console.log('Category "เก็บเกี่ยวและขนส่ง" already exists.');
        } else {
            console.log('Warning: Original category "ฝ่ายไร่/ศูนย์ขนถ่าย" not found.');
        }
    }

    // 2. Create 'ธุรการวัตถุดิบ/ศูนย์ขนถ่าย' if not exists
    console.log('Creating/Checking "ธุรการวัตถุดิบ/ศูนย์ขนถ่าย"...');
    const newCat = await prisma.category.upsert({
        where: { name: 'ธุรการวัตถุดิบ/ศูนย์ขนถ่าย' },
        update: {},
        create: {
            name: 'ธุรการวัตถุดิบ/ศูนย์ขนถ่าย',
            requiresCCSClosing: true
        }
    });
    console.log(`Category "ธุรการวัตถุดิบ/ศูนย์ขนถ่าย" ID: ${newCat.id}`);

    // 3. Duplicate Workflow Transitions
    // We want 'ธุรการวัตถุดิบ/ศูนย์ขนถ่าย' (newCat) to have the SAME workflow as 'เก็บเกี่ยวและขนส่ง' (or oldCat)
    // Let's get the master transitions (from 'เก็บเกี่ยวและขนส่ง' which we assume is correct/seeded)

    const templateCat = await prisma.category.findUnique({ where: { name: 'เก็บเกี่ยวและขนส่ง' } });

    if (templateCat && newCat) {
        const existingTransitions = await prisma.workflowTransition.count({ where: { categoryId: newCat.id } });

        if (existingTransitions === 0) {
            console.log('Copying workflow transitions...');

            const templateTransitions = await prisma.workflowTransition.findMany({
                where: { categoryId: templateCat.id }
            });

            for (const t of templateTransitions) {
                // Create copy for new category
                await prisma.workflowTransition.create({
                    data: {
                        categoryId: newCat.id,
                        currentStatusId: t.currentStatusId,
                        actionId: t.actionId,
                        requiredRoleId: t.requiredRoleId,
                        nextStatusId: t.nextStatusId,
                        stepSequence: t.stepSequence,
                        filterByDepartment: t.filterByDepartment,
                        correctionTypeId: t.correctionTypeId
                    }
                });
            }
            console.log(`Copied ${templateTransitions.length} transitions.`);
        } else {
            console.log(`Transitions already exist for "ธุรการวัตถุดิบ/ศูนย์ขนถ่าย" (${existingTransitions}). Skipping copy.`);
        }
    }

    console.log('✅ Split complete.');
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
