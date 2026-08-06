import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { defaultTemplateFor, resolveLabHeader, resolveLabFooter } from '@/lib/lab-templates';

/**
 * POST /api/lab/templates/seed-defaults
 * Auto-creates a default GMC-style template for every test in the catalog that
 * doesn't already have one. For tests with a known schema (FBC, LFT, Urinalysis,
 * etc.) uses the table-mode layout. For others, uses the single-value layout.
 * All templates get the GMC-style patient header and signature footer.
 *
 * Body (optional):
 *   { onlyMissing?: boolean, overwrite?: boolean }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !['SUPER_ADMIN', 'ADMIN', 'LAB_TECH'].includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: any = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const onlyMissing = body.onlyMissing !== false;
        const overwrite = body.overwrite === true;

        const tests = await prisma.labTestCatalog.findMany({
            include: {
                category: { select: { name: true } },
                resultTemplate: { select: { id: true } },
            },
            orderBy: { name: 'asc' },
        });

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const failed: Array<{ testId: string; name: string; reason: string }> = [];

        for (const test of tests) {
            if (test.resultTemplate && onlyMissing && !overwrite) {
                skipped++;
                continue;
            }

            try {
                const { normalMin, normalMax } = parseReferenceRange(test.referenceRange);

                const tpl = defaultTemplateFor({
                    testName: test.name,
                    categoryName: test.category?.name,
                    unit: test.unit || '',
                    referenceRange: test.referenceRange || '',
                });

                const data = {
                    labTestId: test.id,
                    templateName: 'Standard Report',
                    resultMode: tpl.resultMode,
                    resultSchema: tpl.resultSchema,
                    headerHtml: await resolveLabHeader(),
                    templateHtml: tpl.templateHtml,
                    footerHtml: await resolveLabFooter(),
                    normalRangeMin: normalMin,
                    normalRangeMax: normalMax,
                    criticalRangeMin: null,
                    criticalRangeMax: null,
                    resultUnit: test.unit || null,
                    isActive: true,
                    updatedById: user.id,
                };

                if (test.resultTemplate && overwrite) {
                    await prisma.labResultTemplate.update({
                        where: { labTestId: test.id },
                        data,
                    });
                    updated++;
                } else if (!test.resultTemplate) {
                    await prisma.labResultTemplate.create({
                        data: { ...data, createdById: user.id },
                    });
                    created++;
                } else {
                    skipped++;
                }
            } catch (err: any) {
                failed.push({ testId: test.id, name: test.name, reason: err.message });
            }
        }

        return NextResponse.json({
            message: 'Seed complete',
            total: tests.length,
            created,
            updated,
            skipped,
            failed: failed.length,
            failures: failed,
        });
    } catch (error: any) {
        console.error('Seed defaults error:', error);
        return NextResponse.json({ error: error.message || 'Failed to seed defaults' }, { status: 500 });
    }
}

function parseReferenceRange(range: string | null | undefined): { normalMin: number | null; normalMax: number | null } {
    if (!range) return { normalMin: null, normalMax: null };
    const r = range.trim();
    const rangeMatch = r.match(/^([\d.]+)\s*(?:-|to|–|—)\s*([\d.]+)/i);
    if (rangeMatch) {
        return { normalMin: parseFloat(rangeMatch[1]), normalMax: parseFloat(rangeMatch[2]) };
    }
    const ltMatch = r.match(/^(?:<|<=)\s*([\d.]+)/);
    if (ltMatch) return { normalMin: null, normalMax: parseFloat(ltMatch[1]) };
    const gtMatch = r.match(/^(?:>|>=)\s*([\d.]+)/);
    if (gtMatch) return { normalMin: parseFloat(gtMatch[1]), normalMax: null };
    const singleMatch = r.match(/^([\d.]+)$/);
    if (singleMatch) return { normalMin: null, normalMax: parseFloat(singleMatch[1]) };
    return { normalMin: null, normalMax: null };
}
