import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { defaultTemplateFor, resolveLabHeader, resolveLabFooter } from '@/lib/lab-templates';
import { standardizedTemplateFor, getTestDefinition, definitionToSchemaRows, type AnalyteRange } from '@/lib/lab-standards';

/**
 * POST /api/lab/templates/seed-defaults
 *
 * Auto-creates (or updates) a template for every test in the catalog.
 *
 * Body (optional):
 *   { onlyMissing?: boolean, overwrite?: boolean, useStandardized?: boolean }
 *
 * - `useStandardized` (default true): when true, prefers the
 *   comprehensive IFCC/WHO/UCI standards map (lib/lab-standards.ts). When
 *   false, falls back to the legacy GMC-style generator.
 * - `onlyMissing` (default true): skip tests that already have a template.
 * - `overwrite`: when true, replace the existing template. (Ignored when
 *   onlyMissing is true.)
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
        const useStandardized = body.useStandardized !== false; // default true

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
        const standardized = 0;
        const fallback = 0;

        for (const test of tests) {
            if (test.resultTemplate && onlyMissing && !overwrite) {
                skipped++;
                continue;
            }

            try {
                // Prefer the comprehensive IFCC/WHO/UCI standards when available.
                const def = getTestDefinition(test.name);
                let tpl: { resultMode: any; templateHtml: string; resultSchema?: any } | null = null;
                if (useStandardized && def) {
                    tpl = standardizedTemplateFor({
                        testName: test.name,
                        categoryName: test.category?.name,
                        unit: test.unit || '',
                        referenceRange: test.referenceRange || '',
                    });
                }
                if (!tpl) {
                    tpl = defaultTemplateFor({
                        testName: test.name,
                        categoryName: test.category?.name,
                        unit: test.unit || '',
                        referenceRange: test.referenceRange || '',
                    });
                }

                // Pick the normal-range bounds for single-value mode.
                // For standardized tests we use the definition's own bounds so
                // the flag computation matches the printed reference range.
                let normalMin: number | null = null;
                let normalMax: number | null = null;
                let criticalMin: number | null = null;
                let criticalMax: number | null = null;
                if (def) {
                    if (def.mode === "single") {
                        normalMin = def.sexRanges?.F?.[0] ?? def.sexRanges?.M?.[0] ?? null;
                        normalMax = def.sexRanges?.F?.[1] ?? def.sexRanges?.M?.[1] ?? null;
                        criticalMin = def.criticalLow ?? null;
                        criticalMax = def.criticalHigh ?? null;
                    }
                } else {
                    const parsed = parseReferenceRange(test.referenceRange);
                    normalMin = parsed.normalMin;
                    normalMax = parsed.normalMax;
                }

                const data = {
                    labTestId: test.id,
                    templateName: 'Standard Report (International)',
                    resultMode: tpl.resultMode,
                    resultSchema: tpl.resultSchema,
                    headerHtml: await resolveLabHeader(),
                    templateHtml: tpl.templateHtml,
                    footerHtml: await resolveLabFooter(),
                    normalRangeMin: normalMin,
                    normalRangeMax: normalMax,
                    criticalRangeMin: criticalMin,
                    criticalRangeMax: criticalMax,
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
            note: 'useStandardized: true (IFCC/WHO/UCI standards map). Pass {useStandardized: false} to fall back to the legacy GMC template.',
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
