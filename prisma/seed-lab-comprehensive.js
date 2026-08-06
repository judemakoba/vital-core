const { PrismaClient } = require('@prisma/client');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
});

async function main() {
    console.log('--- Seeding Comprehensive Lab Catalog hearth ---');

    const labTests = [
        // Hematology
        { name: 'Full Blood Count (FBC/CBC)', category: 'Hematology', price: 25000, referenceRange: 'N/A', unit: 'N/A', template: 'WBC: [ ] x10^9/L\nRBC: [ ] x10^12/L\nHGB: [ ] g/dL\nHCT: [ ] %\nMCV: [ ] fL\nMCH: [ ] pg\nMCHC: [ ] g/dL\nPLT: [ ] x10^9/L' },
        { name: 'Blood Grouping & Crossmatch', category: 'Hematology', price: 15000, referenceRange: 'N/A', unit: 'N/A', template: 'Blood Group: [ ]\nRh Factor: [ ]' },
        { name: 'ESR (Erythrocyte Sedimentation Rate)', category: 'Hematology', price: 10000, referenceRange: '0-15', unit: 'mm/hr' },
        { name: 'Peripheral Blood Film', category: 'Hematology', price: 20000, referenceRange: 'N/A', unit: 'N/A', template: 'RBC Morphology: [ ]\nWBC Morphology: [ ]\nPlatelets: [ ]' },
        { name: 'Sickle Cell Screening (Solubility)', category: 'Hematology', price: 15000, referenceRange: 'Negative', unit: 'N/A' },

        // Biochemistry
        { name: 'Random Blood Glucose', category: 'Biochemistry', price: 8000, referenceRange: '3.9-7.8', unit: 'mmol/L' },
        { name: 'Fasting Blood Glucose', category: 'Biochemistry', price: 10000, referenceRange: '3.9-6.1', unit: 'mmol/L' },
        { name: 'Liver Function Tests (LFTs)', category: 'Biochemistry', price: 45000, referenceRange: 'N/A', unit: 'N/A', template: 'ALT: [ ] U/L\nAST: [ ] U/L\nALP: [ ] U/L\nTotal Bilirubin: [ ] umol/L\nDirect Bilirubin: [ ] umol/L\nTotal Protein: [ ] g/L\nAlbumin: [ ] g/L' },
        { name: 'Renal Function Tests (RFTs/UEC)', category: 'Biochemistry', price: 40000, referenceRange: 'N/A', unit: 'N/A', template: 'Urea: [ ] mmol/L\nCreatinine: [ ] umol/L\nSodium: [ ] mmol/L\nPotassium: [ ] mmol/L\nChloride: [ ] mmol/L' },
        { name: 'Lipid Profile', category: 'Biochemistry', price: 50000, referenceRange: 'N/A', unit: 'N/A', template: 'Total Cholesterol: [ ] mmol/L\nTriglycerides: [ ] mmol/L\nHDL: [ ] mmol/L\nLDL: [ ] mmol/L' },
        { name: 'HbA1c', category: 'Biochemistry', price: 35000, referenceRange: '4.0-6.0', unit: '%' },

        // Serology / Immunology
        { name: 'Malaria RDT', category: 'Serology', price: 10000, referenceRange: 'Negative', unit: 'N/A' },
        { name: 'Malaria Microscopy (BS for MPs)', category: 'Serology', price: 12000, referenceRange: 'No MPs seen', unit: 'N/A', template: 'MPs: [ ]\nDensity: [ ]/uL' },
        { name: 'Typhoid Widal Test', category: 'Serology', price: 15000, referenceRange: '< 1/80', unit: 'Titre' },
        { name: 'H. Pylori (Fecal/Serum)', category: 'Serology', price: 25000, referenceRange: 'Negative', unit: 'N/A' },
        { name: 'HIV 1&2 Screening', category: 'Serology', price: 10000, referenceRange: 'Non-Reactive', unit: 'N/A' },
        { name: 'Hepatitis B Surface Antigen (HBsAg)', category: 'Serology', price: 15000, referenceRange: 'Non-Reactive', unit: 'N/A' },
        { name: 'Syphilis (VDRL/RPR)', category: 'Serology', price: 10000, referenceRange: 'Non-Reactive', unit: 'N/A' },
        { name: 'Brucella Test', category: 'Serology', price: 15000, referenceRange: 'Negative', unit: 'N/A' },
        { name: 'Rheumatoid Factor', category: 'Serology', price: 20000, referenceRange: 'Negative', unit: 'N/A' },

        // Microbiology
        { name: 'Urinalysis (Dipstick & Microscopy)', category: 'Microbiology', price: 15000, referenceRange: 'N/A', unit: 'N/A', template: 'Color: [ ]\nAppearance: [ ]\nPH: [ ]\nGlucose: [ ]\nProtein: [ ]\nNitrites: [ ]\nLeucocytes: [ ]\nPus Cells: [ ]\nRBCs: [ ]\nEpithelial Cells: [ ]' },
        { name: 'Stool Analysis', category: 'Microbiology', price: 15000, referenceRange: 'N/A', unit: 'N/A', template: 'Consistency: [ ]\nColor: [ ]\nMacro: [ ]\nMicro: [ ]' },
        { name: 'Pregnancy Test (Urine hCG)', category: 'Microbiology', price: 5000, referenceRange: 'Negative', unit: 'N/A' },
        { name: 'High Vaginal Swab (HVS) Wet Mount', category: 'Microbiology', price: 20000, referenceRange: 'N/A', unit: 'N/A', template: 'Clue Cells: [ ]\nTrichomonas: [ ]\nYeasts: [ ]' },
        { name: 'Gram Stain', category: 'Microbiology', price: 15000, referenceRange: 'N/A', unit: 'N/A' },

        // Others
        { name: 'Semen Analysis', category: 'General', price: 40000, referenceRange: 'N/A', unit: 'N/A', template: 'Liquefaction: [ ]\nCount: [ ]\nMotility: [ ]\nMorphology: [ ]' }
    ];

    for (const test of labTests) {
        await prisma.labTestCatalog.upsert({
            where: { name: test.name },
            update: {
                category: test.category,
                price: test.price,
                referenceRange: test.referenceRange,
                unit: test.unit,
                template: test.template || null,
                isActive: true
            },
            create: {
                ...test,
                isActive: true
            }
        });
        console.log(`✅ ${test.name} ensured in catalog`);
    }

    console.log('--- Lab Seeding Complete hearth ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
