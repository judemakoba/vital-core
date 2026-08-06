const { PrismaClient } = require('@prisma/client');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
});

async function main() {
    console.log('--- Seeding Insurance Data hearth ---');

    const companies = [
        {
            name: 'UAP Old Mutual',
            plans: [
                { name: 'Classic', discount: 0 },
                { name: 'Gold', discount: 15 },
                { name: 'Platinum', discount: 25 }
            ]
        },
        {
            name: 'Liberty Insurance',
            plans: [
                { name: 'Standard', discount: 0 },
                { name: 'Blue', discount: 10 },
                { name: 'Elite', discount: 20 }
            ]
        },
        {
            name: 'Jubilee Insurance',
            plans: [
                { name: 'Ordinary', discount: 0 },
                { name: 'Executive', discount: 15 },
                { name: 'VVIP', discount: 30 }
            ]
        },
        {
            name: 'Sanlam Insurance',
            plans: [
                { name: 'Basic', discount: 0 },
                { name: 'Premium', discount: 15 },
                { name: 'Ultimate', discount: 20 }
            ]
        },
        {
            name: 'ICEA Lion Insurance',
            plans: [
                { name: 'General', discount: 5 },
                { name: 'Corporate A', discount: 20 },
                { name: 'Corporate B', discount: 50 }
            ]
        },
        {
            name: 'Prudential Insurance',
            plans: [
                { name: 'Pru-Health', discount: 10 },
                { name: 'Pru-Elite', discount: 25 }
            ]
        }
    ];

    for (const company of companies) {
        const ensuredCompany = await prisma.insuranceCompany.upsert({
            where: { name: company.name },
            update: {},
            create: {
                name: company.name,
                isActive: true
            }
        });

        console.log(`🏢 Insurance Company: ${company.name}`);

        for (const plan of company.plans) {
            await prisma.insurancePlan.upsert({
                where: { id: `plan-${company.name.replace(/\s+/g, '-').toLowerCase()}-${plan.name.toLowerCase()}` },
                update: {
                    name: plan.name,
                    discountPercentage: plan.discount
                },
                create: {
                    id: `plan-${company.name.replace(/\s+/g, '-').toLowerCase()}-${plan.name.toLowerCase()}`,
                    companyId: ensuredCompany.id,
                    name: plan.name,
                    discountPercentage: plan.discount
                }
            });
            console.log(`   📜 Plan: ${plan.name} (${plan.discount}% discount)`);
        }
    }

    console.log('--- Insurance Seeding Complete hearth ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
