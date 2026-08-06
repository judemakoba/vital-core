import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET  /api/radiology/templates            — list all templates (with optional ?radiologyCatalogId filter)
 * POST /api/radiology/templates            — create or upsert a template
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const radiologyCatalogId = searchParams.get('radiologyCatalogId');

        const where = radiologyCatalogId ? { radiologyCatalogId } : {};
        const templates = await prisma.radiologyResultTemplate.findMany({
            where,
            include: {
                radiologyCatalog: {
                    select: {
                        id: true,
                        name: true,
                        category: { select: { name: true } },
                        turnaroundTime: true,
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json(templates);
    } catch (error: any) {
        console.error('Radiology templates list error:', error);
        return NextResponse.json({ error: error.message || 'Failed to load templates' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN', 'LAB_TECH', 'DOCTOR', 'RADIOLOGIST'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            radiologyCatalogId,
            templateName,
            headerHtml,
            templateHtml,
            footerHtml,
            isActive,
        } = body;

        if (!radiologyCatalogId) {
            return NextResponse.json({ error: 'radiologyCatalogId is required' }, { status: 400 });
        }
        if (!templateHtml || templateHtml.trim() === '') {
            return NextResponse.json({ error: 'templateHtml is required' }, { status: 400 });
        }

        const exam = await prisma.radiologyCatalog.findUnique({ where: { id: radiologyCatalogId } });
        if (!exam) return NextResponse.json({ error: 'Radiology exam not found' }, { status: 404 });

        const data: any = {
            radiologyCatalogId,
            templateName: templateName || 'Standard Report',
            headerHtml: headerHtml || null,
            templateHtml,
            footerHtml: footerHtml || null,
            isActive: isActive !== false,
            updatedById: user.id,
        };

        const template = await prisma.radiologyResultTemplate.upsert({
            where: { radiologyCatalogId },
            create: { ...data, createdById: user.id },
            update: data,
        });

        return NextResponse.json({ message: 'Template saved', template });
    } catch (error: any) {
        console.error('Radiology template save error:', error);
        return NextResponse.json({ error: error.message || 'Failed to save template' }, { status: 500 });
    }
}
