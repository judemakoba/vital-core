export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const categoryId = searchParams.get('categoryId') || '';

        const catalog = await prisma.radiologyCatalog.findMany({
            where: {
                isActive: true,
                ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
                ...(categoryId ? { categoryId } : {}),
            },
            include: {
                category: true,
                resultTemplate: {
                    select: {
                        id: true,
                        templateName: true,
                        isActive: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json(catalog);
    } catch (error) {
        console.error('Radiology catalog error:', error);
        return NextResponse.json({ error: 'Failed to fetch radiology catalog' }, { status: 500 });
    }
}
