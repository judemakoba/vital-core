import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { defaultRadiologyTemplate, resolveRadHeader, resolveRadFooter } from '@/lib/radiology-templates';

/**
 * POST /api/radiology/templates/seed-defaults
 * Auto-creates a default GMC-style template for every Radiology exam that
 * doesn't already have one. Each template gets the standardized GMC header
 * (patient demographics table), body (Technique/Findings/Impression/Recommendation
 * sections), and footer (signature block).
 *
 * Body (optional):
 *   { onlyMissing?: boolean, overwrite?: boolean }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: any = {};
        try { body = await request.json(); } catch { body = {}; }
        const onlyMissing = body.onlyMissing !== false;
        const overwrite = body.overwrite === true;

        const exams = await prisma.radiologyCatalog.findMany({
            include: {
                category: { select: { name: true } },
                resultTemplate: { select: { id: true } },
            },
            orderBy: { name: 'asc' },
        });

        let created = 0, updated = 0, skipped = 0;
        const failed: Array<{ examId: string; name: string; reason: string }> = [];

        for (const exam of exams) {
            if (exam.resultTemplate && onlyMissing && !overwrite) {
                skipped++;
                continue;
            }

            try {
                const modality = exam.category?.name || 'Imaging';
                const tpl = defaultRadiologyTemplate({
                    examName: exam.name,
                    modality,
                    category: modality,
                });

                const data = {
                    radiologyCatalogId: exam.id,
                    templateName: tpl.templateName,
                    headerHtml: await resolveRadHeader(),
                    templateHtml: tpl.templateHtml,
                    footerHtml: await resolveRadFooter(),
                    isActive: true,
                    updatedById: user.id,
                };

                if (exam.resultTemplate && overwrite) {
                    await prisma.radiologyResultTemplate.update({
                        where: { id: exam.resultTemplate.id },
                        data,
                    });
                    updated++;
                } else if (!exam.resultTemplate) {
                    await prisma.radiologyResultTemplate.create({
                        data: { ...data, createdById: user.id },
                    });
                    created++;
                } else {
                    skipped++;
                }
            } catch (err: any) {
                failed.push({ examId: exam.id, name: exam.name, reason: err.message });
            }
        }

        return NextResponse.json({
            message: 'Seed complete',
            total: exams.length,
            created,
            updated,
            skipped,
            failed: failed.length,
            failures: failed,
        });
    } catch (error: any) {
        console.error('Radiology seed defaults error:', error);
        return NextResponse.json({ error: error.message || 'Failed to seed defaults' }, { status: 500 });
    }
}
