import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const count = await prisma.billableItem.count();
        if (count > 0) {
            return NextResponse.json({ message: 'Catalog already contains items' });
        }

        const items = [
            // Consultation Fees
            { name: 'General Consultation', code: 'CNS-001', category: 'MEDICAL_FEE', price: 2000, description: 'Standard consultation with a general practitioner' },
            { name: 'Specialist Consultation', code: 'CNS-002', category: 'MEDICAL_FEE', price: 5000, description: 'Consultation with a specialist' },
            { name: 'Nursing Review', code: 'CNS-003', category: 'MEDICAL_FEE', price: 500, description: 'Basic nursing assessment' },

            // Lab Tests
            { name: 'Full Blood Count (FBC)', code: 'LAB-001', category: 'LABORATORY', price: 1500, description: 'Complete hemogram' },
            { name: 'Urinalysis', code: 'LAB-002', category: 'LABORATORY', price: 800, description: 'Urine chemistry and microscopy' },
            { name: 'Malaria Test (Blood Slide)', code: 'LAB-003', category: 'LABORATORY', price: 500, description: 'Screening for malaria parasites' },
            { name: 'Blood Glucose (Random)', code: 'LAB-004', category: 'LABORATORY', price: 400, description: 'Sugar level check' },
            { name: 'Kidney Function Test (KFT)', code: 'LAB-005', category: 'LABORATORY', price: 3500, description: 'Urea, Creatinine, Electrolytes' },

            // Pharmacy / Medications (Base prices)
            { name: 'Paracetamol 500mg', code: 'DRG-001', category: 'MEDICATION', price: 20, description: 'Analgesic / Antipyretic' },
            { name: 'Amoxicillin 500mg', code: 'DRG-002', category: 'MEDICATION', price: 150, description: 'Broad spectrum antibiotic' },
            { name: 'Artemether/Lumefantrine (AL)', code: 'DRG-003', category: 'MEDICATION', price: 600, description: 'Antimalarial medication' },
            { name: 'Cetriphine 10mg', code: 'DRG-004', category: 'MEDICATION', price: 50, description: 'Antihistamine' },

            // Radiology
            { name: 'Chest X-Ray', code: 'RAD-001', category: 'RADIOLOGY', price: 2500, description: 'Frontal chest view' },
            { name: 'Abdominal Ultrasound', code: 'RAD-002', category: 'RADIOLOGY', price: 3500, description: 'General abdominal scan' },

            // Procedures
            { name: 'Wound Dressing (Small)', code: 'PRC-001', category: 'PROCEDURE', price: 800, description: 'Minor wound care' },
            { name: 'IV Cannulation', code: 'PRC-002', category: 'PROCEDURE', price: 500, description: 'Insertion of IV line' }
        ];

        const created = await prisma.billableItem.createMany({
            data: items.map(item => ({
                itemName: item.name,
                itemCode: item.code,
                category: item.category,
                standardRate: item.price,
                description: item.description,
                frequency: 1,
                application: 'GENERAL',
                isActive: true
            })) as any   // seed-only: schema may evolve, cast guards optional future fields
        });

        return NextResponse.json({ 
            success: true, 
            count: created.count,
            message: `Successfully seeded ${created.count} clinical items`
        });
    } catch (error) {
        console.error('Catalog Seed Error:', error);
        return NextResponse.json({ error: 'Failed to seed clinical catalog' }, { status: 500 });
    }
}
