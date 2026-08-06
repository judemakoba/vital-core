import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET  /api/lab/templates           — list all templates (with optional ?labTestId filter)
 * POST /api/lab/templates           — create or upsert a template for a test
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const labTestId = searchParams.get('labTestId');

        const where = labTestId ? { labTestId } : {};
        const templates = await prisma.labResultTemplate.findMany({
            where,
            include: {
                labTest: {
                    select: {
                        id: true,
                        name: true,
                        unit: true,
                        referenceRange: true,
                        category: { select: { name: true } },
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json(templates);
    } catch (error: any) {
        console.error('Templates list error:', error);
        return NextResponse.json({ error: error.message || 'Failed to load templates' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN', 'LAB_TECH', 'DOCTOR'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            labTestId,
            templateName,
            headerHtml,
            templateHtml,
            footerHtml,
            normalRangeMin,
            normalRangeMax,
            criticalRangeMin,
            criticalRangeMax,
            resultUnit,
            isActive,
        } = body;

        if (!labTestId) {
            return NextResponse.json({ error: 'labTestId is required' }, { status: 400 });
        }
        if (!templateHtml || templateHtml.trim() === '') {
            return NextResponse.json({ error: 'templateHtml is required' }, { status: 400 });
        }

        // Verify the test exists
        const test = await prisma.labTestCatalog.findUnique({ where: { id: labTestId } });
        if (!test) return NextResponse.json({ error: 'Lab test not found' }, { status: 404 });

        const data = {
            labTestId,
            templateName: templateName || 'Standard Report',
            headerHtml: headerHtml || null,
            templateHtml,
            footerHtml: footerHtml || null,
            normalRangeMin: normalRangeMin != null && normalRangeMin !== '' ? parseFloat(normalRangeMin) : null,
            normalRangeMax: normalRangeMax != null && normalRangeMax !== '' ? parseFloat(normalRangeMax) : null,
            criticalRangeMin: criticalRangeMin != null && criticalRangeMin !== '' ? parseFloat(criticalRangeMin) : null,
            criticalRangeMax: criticalRangeMax != null && criticalRangeMax !== '' ? parseFloat(criticalRangeMax) : null,
            resultUnit: resultUnit || null,
            isActive: isActive !== false,
            updatedById: user.id,
        };

        const template = await prisma.labResultTemplate.upsert({
            where: { labTestId },
            create: { ...data, createdById: user.id },
            update: data,
        });

        return NextResponse.json({ message: 'Template saved', template });
    } catch (error: any) {
        console.error('Template save error:', error);
        return NextResponse.json({ error: error.message || 'Failed to save template' }, { status: 500 });
    }
}
