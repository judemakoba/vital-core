import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { idValueSchema } from '@/lib/validation/schemas';

/**
 * GET    /api/lab/templates/[id]  — fetch a single template
 * PUT    /api/lab/templates/[id]  — update a single template
 * DELETE /api/lab/templates/[id]  — delete a template
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
        }

        const template = await prisma.labResultTemplate.findUnique({
            where: { id: idCheck.data },
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
        });

        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        return NextResponse.json(template);
    } catch (error: any) {
        console.error('Template fetch error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch template' }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN', 'LAB_TECH', 'DOCTOR'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
        }

        const body = await request.json();
        const {
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

        if (templateHtml !== undefined && (!templateHtml || templateHtml.trim() === '')) {
            return NextResponse.json({ error: 'templateHtml cannot be empty' }, { status: 400 });
        }

        const existing = await prisma.labResultTemplate.findUnique({ where: { id: idCheck.data } });
        if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        const data: any = { updatedById: user.id };
        if (templateName !== undefined) data.templateName = templateName || 'Standard Report';
        if (headerHtml !== undefined) data.headerHtml = headerHtml || null;
        if (templateHtml !== undefined) data.templateHtml = templateHtml;
        if (footerHtml !== undefined) data.footerHtml = footerHtml || null;
        if (normalRangeMin !== undefined) data.normalRangeMin = normalRangeMin != null && normalRangeMin !== '' ? parseFloat(normalRangeMin) : null;
        if (normalRangeMax !== undefined) data.normalRangeMax = normalRangeMax != null && normalRangeMax !== '' ? parseFloat(normalRangeMax) : null;
        if (criticalRangeMin !== undefined) data.criticalRangeMin = criticalRangeMin != null && criticalRangeMin !== '' ? parseFloat(criticalRangeMin) : null;
        if (criticalRangeMax !== undefined) data.criticalRangeMax = criticalRangeMax != null && criticalRangeMax !== '' ? parseFloat(criticalRangeMax) : null;
        if (resultUnit !== undefined) data.resultUnit = resultUnit || null;
        if (isActive !== undefined) data.isActive = !!isActive;

        const template = await prisma.labResultTemplate.update({
            where: { id: idCheck.data },
            data,
        });

        return NextResponse.json({ message: 'Template updated', template });
    } catch (error: any) {
        console.error('Template update error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update template' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
        }

        await prisma.labResultTemplate.delete({ where: { id: idCheck.data } });
        return NextResponse.json({ message: 'Template deleted' });
    } catch (error: any) {
        console.error('Template delete error:', error);
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        return NextResponse.json({ error: error.message || 'Failed to delete template' }, { status: 500 });
    }
}
