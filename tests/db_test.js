const { PrismaClient } = require('@prisma/client');

async function test() {
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });

    console.log("DEBUG: Attempting connection to:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@") + " hearth");

    try {
        await prisma.$connect();
        console.log("✅ Connection Successful heath");
        const roles = await prisma.role.findMany();
        console.log("✅ Query Successful, Role count:", roles.length);
    } catch (err) {
        console.error("❌ Connection Failed heath");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
        if (err.meta) console.error("Error Meta:", err.meta);
    } finally {
        await prisma.$disconnect();
    }
}

test();
