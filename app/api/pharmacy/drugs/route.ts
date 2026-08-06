import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';

        const drugs = await prisma.drug.findMany({
            where: {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { genericName: { contains: search, mode: 'insensitive' } },
                    { drugCode: { contains: search, mode: 'insensitive' } }
                ]
            },
            include: {
                category: true,
                priceList: {
                    where: { isActive: true, priceType: 'REGULAR' },
                    take: 1
                },
                _count: {
                    select: { batches: { where: { quantityRemaining: { gt: 0 } } } }
                }
            },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(drugs);
    } catch (error) {
        console.error('Drug master fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch drug master data' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await request.json();
        
        // Required fields per schema
        const {
            drugCode,
            name,
            genericName,
            categoryId,
            schedule,
            dosageForm,
            strength,
            packageSize,
            packageUnit,
            storage
        } = body;

        if (!drugCode || !name || !genericName || !categoryId || !schedule || !dosageForm || !strength || !packageSize || !packageUnit || !storage) {
            return NextResponse.json({ error: 'Missing required drug fields' }, { status: 400 });
        }

        // Check for existing drug code
        const existing = await prisma.drug.findUnique({
            where: { drugCode }
        });

        if (existing) {
            return NextResponse.json({ error: 'Drug code already exists' }, { status: 400 });
        }

        const newDrug = await prisma.drug.create({
            data: {
                drugCode,
                name,
                genericName,
                // Use the relation form — compatible across Prisma 5/6 checked vs unchecked input types
                category: { connect: { id: categoryId } },
                schedule,
                dosageForm,
                strength,
                packageSize: Number(packageSize),
                packageUnit,
                storage,
                // optional fields
                drugClass: body.drugClass || null,
                isControlled: body.isControlled || false,
                // strengthValue is Float (non-nullable with @default(0)) — use 0 instead of null
                strengthValue: body.strengthValue ? Number(body.strengthValue) : 0,
                strengthUnit: body.strengthUnit || null,
                manufacturer: body.manufacturer || null,
                countryOfOrigin: body.countryOfOrigin || null,
                indications: body.indications || null,
                contraindications: body.contraindications || null,
                sideEffects: body.sideEffects || null,
                shelfLifeMonths: body.shelfLifeMonths ? Number(body.shelfLifeMonths) : null,
                isActive: body.isActive !== undefined ? body.isActive : true,
                isRestricted: body.isRestricted || false
            },
            include: {
                category: true,
                _count: {
                    select: { batches: true }
                }
            }
        });

        return NextResponse.json(newDrug, { status: 201 });
    } catch (error) {
        console.error('Failed to register drug:', error);
        return NextResponse.json({ error: 'Failed to register drug' }, { status: 500 });
    }
}
