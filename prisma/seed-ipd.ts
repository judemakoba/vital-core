import { PrismaClient } from '../lib/generated-prisma';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding IPD Wards and Beds ---');

    // Wards
    const wardsToSeed = [
        {
            name: 'General Male Ward',
            type: 'GENERAL',
            description: 'Standard ward for male patients',
            capacity: 10,
            beds: Array.from({ length: 10 }).map((_, i) => ({
                bedNumber: `GMW-${(i + 1).toString().padStart(2, '0')}`,
                type: 'STANDARD',
                status: 'AVAILABLE',
                ratePerDay: 20000,
            }))
        },
        {
            name: 'General Female Ward',
            type: 'GENERAL',
            description: 'Standard ward for female patients',
            capacity: 10,
            beds: Array.from({ length: 10 }).map((_, i) => ({
                bedNumber: `GFW-${(i + 1).toString().padStart(2, '0')}`,
                type: 'STANDARD',
                status: 'AVAILABLE',
                ratePerDay: 20000,
            }))
        },
        {
            name: 'Maternity Ward',
            type: 'MATERNITY',
            description: 'Ward for maternity and obstetrics care',
            capacity: 6,
            beds: Array.from({ length: 6 }).map((_, i) => ({
                bedNumber: `MAT-${(i + 1).toString().padStart(2, '0')}`,
                type: 'MATERNITY_BED',
                status: 'AVAILABLE',
                ratePerDay: 35000,
            }))
        },
        {
            name: 'Intensive Care Unit (ICU)',
            type: 'ICU',
            description: 'Critical care specialized ward',
            capacity: 4,
            beds: Array.from({ length: 4 }).map((_, i) => ({
                bedNumber: `ICU-${(i + 1).toString().padStart(2, '0')}`,
                type: 'ICU_BED',
                features: 'Ventilator, Cardiac Monitor',
                status: 'AVAILABLE',
                ratePerDay: 150000,
            }))
        }
    ];

    for (const wardData of wardsToSeed) {
        // Upsert ward (by name, usually we use id or code, but here we can check if it exists)
        let ward = await prisma.ward.findFirst({ where: { name: wardData.name } });
        
        if (!ward) {
            ward = await prisma.ward.create({
                data: {
                    name: wardData.name,
                    type: wardData.type,
                    description: wardData.description,
                    capacity: wardData.capacity,
                }
            });
            console.log(`Created Ward: ${ward.name}`);
            
            // Create beds for this ward
            for (const bedData of wardData.beds) {
                await prisma.bed.create({
                    data: {
                        wardId: ward.id,
                        bedNumber: bedData.bedNumber,
                        type: bedData.type,
                        status: bedData.status,
                        ratePerDay: bedData.ratePerDay,
                        features: (bedData as any).features || null
                    }
                });
            }
            console.log(`  -> Created ${wardData.beds.length} beds for ${ward.name}`);
        } else {
            console.log(`Ward already exists: ${ward.name}`);
        }
    }

    console.log('--- Done Seeding IPD Wards and Beds ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
