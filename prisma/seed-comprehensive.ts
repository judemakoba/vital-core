import { PrismaClient, DosageForm, StorageCondition, DrugSchedule, ServiceType } from '../lib/generated-prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Comprehensive Seeding ---');

    console.log('Cleaning up old data...');
    try {
        await prisma.insurancePriceListItem.deleteMany({});
        await prisma.insuranceCompany.deleteMany({});
        await prisma.systemSetting.deleteMany({});
        // We don't delete roles/users to avoid breaking login
    } catch (e: any) {
        console.log('Cleanup non-critical error (might be relations):', e.message);
    }

    // 1. Roles & Users (Quick check/ensure from existing seed)
    const roleNames = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECH', 'ACCOUNTANT', 'CASHIER'];
    for (const name of roleNames) {
        await prisma.role.upsert({
            where: { name },
            update: {},
            create: { name, description: `Default system role for ${name.toLowerCase().replace('_', ' ')}` }
        });
    }

    console.log('Seeding Staff Users...');
    const usersToCreate = [
        {
            name: 'Super Admin User',
            email: 'superadmin@vitalcore.com',
            password: 'password123',
            role: 'SUPER_ADMIN',
            employeeId: 'EMP-001'
        },
        {
            name: 'Admin User',
            email: 'admin@vitalcore.com',
            password: 'password123',
            role: 'ADMIN',
            employeeId: 'EMP-002'
        },
        {
            name: 'Dr. John Smith',
            email: 'doctor@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-003',
            department: 'General Medicine',
            specialization: 'General Practitioner'
        },
        {
            name: 'Dr. Amina Nakamura',
            email: 'doctor2@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-008',
            department: 'Pediatrics',
            specialization: 'Pediatrician'
        },
        {
            name: 'Dr. Robert Omondi',
            email: 'doctor3@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-009',
            department: 'Internal Medicine',
            specialization: 'Internist'
        },
        {
            name: 'Dr. Grace Akello',
            email: 'doctor4@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-010',
            department: 'Obstetrics & Gynaecology',
            specialization: 'OB/GYN'
        },
        {
            name: 'Dr. James Muwanguzi',
            email: 'doctor5@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-011',
            department: 'Surgery',
            specialization: 'General Surgeon'
        },
        {
            name: 'Dr. Fatima Hassan',
            email: 'doctor6@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-012',
            department: 'Emergency Medicine',
            specialization: 'Emergency Physician'
        },
        {
            name: 'Nurse Jane Doe',
            email: 'nurse@vitalcore.com',
            password: 'password123',
            role: 'NURSE',
            employeeId: 'EMP-004',
            department: 'Emergency'
        },
        {
            name: 'Receptionist Sarah',
            email: 'reception@vitalcore.com',
            password: 'password123',
            role: 'RECEPTIONIST',
            employeeId: 'EMP-005'
        },
        {
            name: 'Pharmacist Mike',
            email: 'pharmacy@vitalcore.com',
            password: 'password123',
            role: 'PHARMACIST',
            employeeId: 'EMP-006'
        },
        {
            name: 'Lab Tech Alice',
            email: 'lab@vitalcore.com',
            password: 'password123',
            role: 'LAB_TECH',
            employeeId: 'EMP-007'
        },
        {
            name: 'Accountant David Kalungi',
            email: 'accountant@vitalcore.com',
            password: 'password123',
            role: 'ACCOUNTANT',
            employeeId: 'EMP-013'
        },
        {
            name: 'Cashier Prossy Namuli',
            email: 'cashier@vitalcore.com',
            password: 'password123',
            role: 'CASHIER',
            employeeId: 'EMP-014'
        }
    ];

    for (const u of usersToCreate) {
        const hashedPassword = await bcrypt.hash(u.password, 10);
        const role = await prisma.role.findUnique({ where: { name: u.role } });

        if (role) {
            await prisma.user.upsert({
                where: { email: u.email },
                update: {
                    name: u.name,
                    hashedPassword,
                    roleId: role.id,
                    employeeId: u.employeeId,
                    department: (u as any).department || null,
                    specialization: (u as any).specialization || null,
                    isActive: true
                },
                create: {
                    name: u.name,
                    email: u.email,
                    hashedPassword,
                    roleId: role.id,
                    employeeId: u.employeeId,
                    department: (u as any).department || null,
                    specialization: (u as any).specialization || null,
                    isActive: true
                }
            });
            console.log(`👤 User ${u.email} (${u.role}) ensured`);
        }
    }

    const admin = await prisma.user.findFirst({ where: { role: { name: 'SUPER_ADMIN' } } });
    const doctor = await prisma.user.findFirst({ where: { role: { name: 'DOCTOR' } } });
    const pharmacist = await prisma.user.findFirst({ where: { role: { name: 'PHARMACIST' } } });

    // 2. System Settings & Customization
    console.log('Seeding System Settings...');
    const settings = [
        { key: 'CLINIC_NAME', value: 'VitalCore Medical Center' },
        { key: 'CLINIC_ADDRESS', value: 'Plot 45, Kampala Road, Kampala, Uganda' },
        { key: 'CLINIC_PHONE', value: '+256 414 123456' },
        { key: 'CONSULTATION_FEE_REGULAR', value: '20000' },
        { key: 'CONSULTATION_FEE_SPECIALIST', value: '50000' },
        { key: 'CURRENCY', value: 'UGX' },
        { key: 'TAX_RATE', value: '18' }
    ];

    for (const s of settings) {
        await prisma.systemSetting.upsert({
            where: { key: s.key },
            update: { value: s.value },
            create: s
        });
    }

    // 3. Drug Categories & Drugs
    console.log('Seeding Pharmacy Data...');

    // Helper: parse price string ("10,000" -> 10000, null -> null)
    const parsePrice = (price: string | number | null | undefined): number | null => {
        if (price == null) return null;
        const cleaned = String(price).replace(/,/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    };

    // Helper: map unit string to DosageForm enum
    const mapDosageForm = (unit: string | null | undefined): DosageForm => {
        if (!unit) return DosageForm.OTHER;
        const u = unit.toLowerCase().trim();
        if (u === 'tablet' || u === 'tablets') return DosageForm.TABLET;
        if (u === 'capsule' || u === 'capsules') return DosageForm.CAPSULE;
        if (u === 'syrup') return DosageForm.SYRUP;
        if (u === 'suspension') return DosageForm.SUSPENSION;
        if (u === 'injection' || u === 'injections' || u === 'iv') return DosageForm.INJECTION;
        if (u === 'cream') return DosageForm.CREAM;
        if (u === 'ointment' || u === 'ointement' || u === 'ointments') return DosageForm.OINTMENT;
        if (u === 'gel') return DosageForm.GEL;
        if (u === 'drops' || u === 'drop') return DosageForm.DROPS;
        if (u === 'inhaler') return DosageForm.INHALER;
        if (u === 'rectal' || u === 'rectal oil') return DosageForm.SUPPOSITORY;
        if (u === 'sachet' || u === 'powder') return DosageForm.POWDER;
        return DosageForm.OTHER;
    };

    // Helper: extract strength from name
    const extractStrength = (name: string): { strength: string; value: number; unit: string | null } => {
        const m = name.match(/(\d+(?:\.\d+)?)\s*(mg\/ml|iu\/ml|mcg|mg|g|ml|iu|%)/i);
        if (m) {
            return { strength: m[0], value: parseFloat(m[1]), unit: m[2].toLowerCase() };
        }
        return { strength: 'N/A', value: 0, unit: null };
    };

    // Helper: generate a unique drugCode from name
    const usedCodes = new Set<string>();
    const generateDrugCode = (name: string): string => {
        const base = name.toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .split('-')
            .filter(w => w.length > 0)
            .slice(0, 4)
            .join('-')
            .slice(0, 28);
        let code = base || 'DRG';
        let n = 1;
        while (usedCodes.has(code)) { code = `${base}-${n++}`; }
        usedCodes.add(code);
        return code;
    };

    // Helper: derive generic name from item name (best-effort: first word of name)
    const deriveGeneric = (name: string): string => {
        // Take everything before the first strength (e.g., "Amoxicillin Trihydrate 500mg" -> "Amoxicillin Trihydrate")
        const m = name.match(/^(.*?)\s+\d/);
        if (m) return m[1].trim();
        // Otherwise first 1-3 words
        return name.split(/\s+/).slice(0, 3).join(' ');
    };

    // Helper: categorize drug by name keywords
    const categorizeDrug = (name: string, categories: Record<string, string>): string => {
        const n = name.toLowerCase();
        if (n.match(/amoxi|ceftri|cefuroxime|cefodo|cef-?\d|cepha|cefad|cefixi|cefep|cefota|cefalexin|azithro|erythro|cipro|levo|metronida|doxy|flucox|penicil|gentamic|clinda|nystat|flucon|amphote|trimetho|sulfame|azithro|norflox|oflox/)) return categories['Antibiotics'];
        if (n.match(/artem|coart|artesun|malar|fansidar|artequ|artefan|coartesian/)) return categories['Antimalarials'];
        if (n.match(/paracetamol|panadol|ibuprof|diclofenac|aspirin|tramadol|morph|piroxi|ketorolac|lornoxicam|etori|meloxi|mefenamic|aceclofenac|celecoxib|tenoxicam|fenoprofen/)) return categories['Analgesics'];
        if (n.match(/amlod|atenolol|losar|valsar|hydroch|carvedilol|metoprolol|telmisar|olme|cilaze|nebivolol|propranolol|aten|verapa|nifedip|adala|captopril|lisinopril|perindo|indera|indap|arbi|aldac|arbitel|amlodac|amlodar|amlodenk|amlozaar|cilnidip/)) return categories['Cardiovascular'];
        if (n.match(/omep|lansop|panto|esomep|cimeti|raniti|loper|domperi|ondansetro|domep|pantopra|metoclo|cyclop|pepto|bismosal/)) return categories['Gastrointestinal'];
        if (n.match(/metfor|glib|glimep|insulin|amaryl|diapiride|pioglitazone|empagliflozin|glucophage|tozaar|januvia/)) return categories['Other']; // diabetes falls under Other
        return categories['Other'];
    };

    const catData = [
        { name: 'Antibiotics', code: 'CAT-ANTIBIOTICS', desc: 'Bacterial infection treatments' },
        { name: 'Analgesics', code: 'CAT-ANALGESICS', desc: 'Pain relief and anti-inflammatory' },
        { name: 'Antimalarials', code: 'CAT-ANTIMALARIALS', desc: 'Malaria treatment and prevention' },
        { name: 'Cardiovascular', code: 'CAT-CARDIO', desc: 'Heart and blood pressure medications' },
        { name: 'Gastrointestinal', code: 'CAT-GASTRO', desc: 'Stomach and digestive health' },
        { name: 'Other', code: 'CAT-OTHER', desc: 'Other medications (diabetes, vitamins, topical, etc.)' },
    ];

    const categories: Record<string, string> = {};
    for (const c of catData) {
        const cat = await prisma.drugCategory.upsert({
            where: { code: c.code },
            update: {},
            create: { name: c.name, code: c.code, description: c.desc }
        });
        categories[c.name] = cat.id;
    }

    const drugData = [
        { item: "Volar 300mg Capsule", unit: "Capsule", price: "10000" },
        { item: "Aceclofenac Tablets 100mg", unit: "Tablet", price: "400" },
        { item: "Aceclofenac / Paracetamol 100mg/500mg (G-Alfenac)", unit: "Tablet", price: "600" },
        { item: "Aciclovir Tablets 800mg", unit: "Tablet", price: "6,000" },
        { item: "Actifed Dry Cough Syrup 100ml", unit: "Syrup", price: "10,000" },
        { item: "Actifed Wet Cough Syrup 100ml", unit: "Syrup", price: "10,000" },
        { item: "Action 500mg Tablets", unit: "Tablet", price: "250" },
        { item: "Acyclovir Cream 5g", unit: "Cream", price: "4,000" },
        { item: "Acyclovir Tablets 200mg", unit: "Tablet", price: "800" },
        { item: "Acyclovir Tablets 400mg", unit: "Tablet", price: "1,400" },
        { item: "Adalat LA 30mg Tablets", unit: "Tablet", price: "1,500" },
        { item: "Albendazole Oral Suspension 200mg/5ml (Bendex)", unit: "Syrup", price: "3,000" },
        { item: "Albendazole Chewable Tablets 400mg", unit: "Tablet", price: "2,000" },
        { item: "Aerius Syrup 0.5mg/ml", unit: "Syrup", price: "22,000" },
        { item: "Aerius Tablets 5mg", unit: "Tablet", price: "3,200" },
        { item: "Alfuzosin Tablets 10mg", unit: "Tablet", price: "1,600" },
        { item: "Aldomet 250mg Tablets", unit: "Tablet", price: "500" },
        { item: "Allopurinol Tablets 300mg (Zynol)", unit: "Tablet", price: "800" },
        { item: "Allopurinol Tablets 100mg", unit: "Tablet", price: "600" },
        { item: "Almotan 6.25mg Tablets", unit: "Tablet", price: "3,000" },
        { item: "Amaryl 2mg Tablets", unit: "Tablet", price: "2,000" },
        { item: "Ambrodil Infant Drops 15ml", unit: "Drops", price: "7,000" },
        { item: "Ambrodil Syrup 100ml (Ambroxol)", unit: "Syrup", price: "7,500" },
        { item: "Ambrox 75mg Sustained Release Capsules", unit: "Capsule", price: "1,000" },
        { item: "Ambroxol HCl Syrup (Ambrolen)", unit: "Syrup", price: "15,000" },
        { item: "Amiodarone Injection 100mg/3ml", unit: "Injection", price: "2,000" },
        { item: "Amikacin Injection 500mg/2ml", unit: "Injection", price: "20,000" },
        { item: "Aminophylline Injection 250mg/10ml", unit: "Injection", price: "5,000" },
        { item: "Aminophylline Tablets 100mg", unit: "Tablet", price: "200" },
        { item: "Amlodac 5mg Tablets", unit: "Tablet", price: "600" },
        { item: "Amlodac 10mg Tablets", unit: "Tablet", price: "800" },
        { item: "Amlodar 10mg Tablets", unit: "Tablet", price: "900" },
        { item: "Amlodenk 10mg Tablets", unit: "Tablet", price: "1,200" },
        { item: "Gintex 500 mg capsules", unit: "Capsule", price: "10000" },
        { item: "Amlozaar-H Tablets", unit: "Tablet", price: "2,000" },
        { item: "Amlozaar Tablets", unit: "Tablet", price: "1,500" },
        { item: "Amoxicap 500mg Capsules", unit: "Capsule", price: "400" },
        { item: "Amoxicillin Capsules 250mg", unit: "Capsule", price: "100" },
        { item: "AmoxiKid 250mg Tablets", unit: "Tablet", price: "200" },
        { item: "Amoxicillin Oral Suspension 125mg/5ml (Unixil)", unit: "Syrup", price: "3,000" },
        { item: "Amoxiclav", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Denk 625mg Tablets", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Syrup 457mg/5ml (Clavulin)", unit: "Syrup", price: "22,000" },
        { item: "Amoxiclav Tablets 375mg (Clavulin)", unit: "Tablet", price: "2,000" },
        { item: "Amoxiclav Syrup 228mg/5ml (Clavulin)", unit: "Syrup", price: "17,000" },
        { item: "Amoxiclav Syrup 250mg/62.5mg (Bactoclav / Moxikind)", unit: "Syrup", price: "18,000" },
        { item: "Amoxiclav Injection 1.2g (Clavucin)", unit: "Injection", price: "15,000" },
        { item: "Amoxiclav Tablets 625mg (Rapiclav)", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Synclav 625mg Tablets", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Tablets 375mg (Augmentin)", unit: "Tablet", price: "3,000" },
        { item: "Amoxiclav Tablets 625mg (Clavulin)", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Tablets 625mg (Clavador)", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Syrup 156.25mg/5ml (Clavulin)", unit: "Syrup", price: "17,000" },
        { item: "Amoxiclav Injection 1.2g (Augmentin)", unit: "Injection", price: "32,000" },
        { item: "Amoxiclav Tablets 1g (Augmentin)", unit: "Tablet", price: "6,000" },
        { item: "Amoxiclav Syrup 312.5mg/5ml (Readmox)", unit: "Syrup", price: "17,000" },
        { item: "Amoxiclav IV/IM Injection 600mg (Augmentin)", unit: "Injection", price: "22,000" },
        { item: "Amoxiclav Tablets 625mg (Bactoclav)", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Tablets 375mg (Bactoclav)", unit: "Tablet", price: "2,500" },
        { item: "Amoxiclav Syrup 228mg/5ml (Dafraclav / Clavador)", unit: "Syrup", price: "15,000" },
        { item: "Amoxiclav Syrup 457mg/5ml (Dafraclav)", unit: "Syrup", price: "20,000" },
        { item: "Amoxil-Flucloxacillin Capsules 500mg (Flucamox)", unit: "Capsule", price: "1,500" },
        { item: "Amoxil-Flucloxacillin Syrup 80ml (Flucamox)", unit: "Syrup", price: "18,000" },
        { item: "Amphotericin B Injection 50mg", unit: "Injection", price: "32,000" },
        { item: "Ampicillin-Cloxacillin Injection 500mg", unit: "Injection", price: "5,000" },
        { item: "Ampicillin Injection 500mg", unit: "Injection", price: "5,000" },
        { item: "Ampiclox 500mg Capsules", unit: "Capsule", price: "300" },
        { item: "Ampiclox Syrup 250mg/5ml", unit: "Syrup", price: "5,000" },
        { item: "Andrews Liver Salt", unit: "Sachet", price: "500" },
        { item: "Anti-D Immunoglobulin Injection 300mcg", unit: "Injection", price: "28,000" },
        { item: "Anti-Rabies Vaccine Injection", unit: "Injection", price: "52,000" },
        { item: "Antinal Suspension 220mg/5ml", unit: "Syrup", price: "15,000" },
        { item: "Anomex Suppositories", unit: "Rectal", price: "2,500" },
        { item: "Anusol Ointment 25g", unit: "Ointement", price: "30,000" },
        { item: "Anusol Suppositories", unit: "Rectal", price: "3,500" },
        { item: "Apflu Syrup 100ml", unit: "Syrup", price: "5,000" },
        { item: "Apidone Syrup", unit: "Syrup", price: "22,000" },
        { item: "Aprinox Tablets 2.5mg", unit: "Tablet", price: "300" },
        { item: "Arbitel-AM Tablets", unit: "Tablet", price: "2,300" },
        { item: "Arco DS 250mg Tablet (4's)", unit: "PKTS", price: "12,000" },
        { item: "Artane 2mg Tablets", unit: "Tablet", price: "100" },
        { item: "Artane 5mg Tablets", unit: "Tablet", price: "200" },
        { item: "Artefan 80mg/480mg Tablets", unit: "PKTS", price: "10,000" },
        { item: "Artemether Injection 80mg/ml", unit: "Injection", price: "5,000" },
        { item: "Artemether/Lumefantrine Tablets (Pack of 6)", unit: "PKTS", price: "5,000" },
        { item: "Artemether/Lumefantrine Dry Suspension 180mg/1080mg (Lonart)", unit: "Syrup", price: "13,000" },
        { item: "Artemether/Lumefantrine Syrup (Coartesiane)", unit: "Syrup", price: "18,000" },
        { item: "Artequin Adult Tablets 600mg/750mg", unit: "Tablet", price: "28,000" },
        { item: "Artesunate Injection 30mg", unit: "Injection", price: "8000" },
        { item: "Artesunate Injection 60mg", unit: "Injection", price: "10,000" },
        { item: "Artesunate IV/IM Injection 120mg", unit: "Injection", price: "20,000" },
        { item: "Artesunate Suppositories 50mg/200mg", unit: "Rectal", price: "6,500" },
        { item: "Ascoril Expectorant Syrup 100ml", unit: "Syrup", price: "8,000" },
        { item: "Ascoril Expectorant Syrup 200ml", unit: "Syrup", price: "14,000" },
        { item: "Aspirin Tablets 75mg", unit: "Tablet", price: "300" },
        { item: "Aspirin Cardio 100mg Tablets", unit: "Tablet", price: "400" },
        { item: "Aspirin Delayed-Release Tablets 75mg (Ecorin)", unit: "Tablet", price: "400" },
        { item: "Atacand 16mg Tablets", unit: "Tablet", price: "2000" },
        { item: "Atacand 8mg Tablets", unit: "Tablet", price: "1500" },
        { item: "Atenolol Tablets 100mg", unit: "Tablet", price: "200" },
        { item: "Atenolol Tablets 50mg", unit: "Tablet", price: "100" },
        { item: "Atorvastatin Tablets 10mg (Atorva)", unit: "Tablet", price: "1,000" },
        { item: "Atorvastatin Tablets 20mg (Atorva/Atorfit)", unit: "Tablet", price: "1,200" },
        { item: "Atorvastatin 20mg Tablets (UK)", unit: "Tablet", price: "1,500" },
        { item: "Atorvastatin Tablets 10mg (Lipodar)", unit: "Tablet", price: "800" },
        { item: "Atropine Sulphate Injection 1mg/ml", unit: "Injection", price: "5,000" },
        { item: "Augmentin Injection 1.2g", unit: "Injection", price: "38000" },
        { item: "Augmentin 1g Tablets", unit: "Tablet", price: "6500" },
        { item: "Augmentin ES-600 Powder for Oral Suspension", unit: "Syrup", price: "68000" },
        { item: "Augmentin Syrup 457mg/5ml", unit: "Syrup", price: "47,000" },
        { item: "Augmentin Syrup 228mg/5ml", unit: "Syrup", price: "28,000" },
        { item: "Augmentin Tablets 625mg", unit: "Tablet", price: "4,500" },
        { item: "Avamys Nasal Spray 27.5mcg", unit: "Spray", price: "30,000" },
        { item: "Axcel Syrup", unit: "Syrup", price: "8000" },
        { item: "Axetine Injection 1.5g", unit: "Injection", price: "30000" },
        { item: "Azithromycin Tablets 250mg", unit: "Tablet", price: "1,500" },
        { item: "Azithromycin Oral Suspension 200mg/5ml (Zaha)", unit: "Syrup", price: "12,000" },
        { item: "Azithromycin Tablets 500mg", unit: "Tablet", price: "2000" },
        { item: "Azithromycin Oral Suspension (Zithroriv)", unit: "Syrup", price: "16,000" },
        { item: "Bactroban Ointment 2% 15g", unit: "Ointment", price: "23000" },
        { item: "Barrole 20mg Capsules", unit: "Capsule", price: "1000" },
        { item: "BBC Mouth Spray", unit: "Spray", price: "32000" },
        { item: "Beclometasone 50mcg Inhaler", unit: "Inhaler", price: "24,000" },
        { item: "Beclate Nasal Spray 50mcg", unit: "Spray", price: "25000" },
        { item: "Bendroflumethiazide Tablets 2.5mg/5mg", unit: "Tablet", price: 2000 },
        { item: "Benylin Chesty Cough Syrup 100ml", unit: "Syrup", price: "17,000" },
        { item: "Benylin 4 Flu Syrup 100ml", unit: "Syrup", price: "28,000" },
        { item: "Benylin Dry Cough Syrup 100ml", unit: "Syrup", price: "30000" },
        { item: "Benylin 4 Flu Syrup", unit: "Syrup", price: "40000" },
        { item: "Benylin Paediatric Cough Syrup 100ml", unit: "Syrup", price: "18,000" },
        { item: "Benylin Chesty Cough Syrup Dry 100ml", unit: "Syrup", price: "30,000" },
        { item: "Benylin with Codeine Syrup 100ml", unit: "Syrup", price: "28,000" },
        { item: "Benzathine Penicillin Injection 500mg", unit: "Injection", price: "5,000" },
        { item: "Benzyl Benzoate Application Lotion", unit: "Pcs", price: "2,000" },
        { item: "Benzylpenicillin BP 1 Mega Unit Injection", unit: "Injection", price: "5,000" },
        { item: "Beprosalic Ointment 15g", unit: "Ointment", price: "7,000" },
        { item: "Beprosone Cream 15g", unit: "Cream", price: "8,000" },
        { item: "Betaderm Ointment 15g", unit: "Ointment", price: "3,500" },
        { item: "Betaderm-N Ointment 15g", unit: "Ointment", price: "3,500" },
        { item: "Betamethasone-Neomycin Cream (Betaderm-N)", unit: "Cream", price: "5000" },
        { item: "Betamethasone Cream (Betaderm)", unit: "Cream", price: "3,500" },
        { item: "Betadine Gargle and Mouthwash", unit: "Pcs", price: "30000" },
        { item: "Betahistine Dihydrochloride 8mg Tablets", unit: "Tablet", price: "4800" },
        { item: "Bisacodyl Tablets 5mg", unit: "Tablet", price: "300" },
        { item: "Bisoprolol Fumarate Tablets 10mg", unit: "Tablet", price: "700" },
        { item: "Himalaya Bonnisan Syrup 120ml", unit: "Syrup", price: "13000" },
        { item: "Bleomycin Injection 15IU", unit: "Injection", price: "62000" },
        { item: "Bro-Zedex Syrup 100ml", unit: "Syrup", price: "6000" },
        { item: "Bro-Zeet Syrup 100ml", unit: "Syrup", price: "6000" },
        { item: "Bromazepam Tablets 1.5mg (Lexotanil)", unit: "Tablet", price: "1,000" },
        { item: "Bromocriptine Tablets 2.5mg", unit: "TABLETS", price: "1,500" },
        { item: "Burncure Cream", unit: "Cream", price: "4000" },
        { item: "Buscopan Tablets 10mg", unit: "Tablet", price: "300" },
        { item: "Buscopan Syrup 5mg/5ml", unit: "Syrup", price: "5000" },
        { item: "Candistin Oral Suspension 100,000 IU/ml 60ml", unit: "1", price: "5000" },
        { item: "Calamine Lotion 100ml", unit: "Pcs", price: "3500" },
        { item: "Calcimag Tablets", unit: "Tablet", price: "350" },
        { item: "Calcium Gluconate Injection 10% 10ml", unit: "Injection", price: "10000" },
        { item: "Calcivita Capsules", unit: "Capsule", price: "600" },
        { item: "Candid V6 Vaginal Pessaries", unit: "Pessary", price: "10000" },
        { item: "Candid V Vaginal Gel 30g", unit: "Gel", price: "13000" },
        { item: "Candiderm Cream 15g", unit: "Cream", price: "5000" },
        { item: "Canditral 100mg Capsules", unit: "Capsule", price: "2500" },
        { item: "Calpol Infant Suspension Syrup 100ml", unit: "Syrup", price: "13000" },
        { item: "Calpol Infant Suspension Syrup 60ml", unit: "Syrup", price: "12000" },
        { item: "Captopril Tablets 25mg", unit: "Tablet", price: "300" },
        { item: "Carbamazepine Tablets 200mg (Tegretol)", unit: "Tablet", price: "1,500" },
        { item: "Carbamazepine Tablets 200mg", unit: "Tablet", price: "100" },
        { item: "Carvedilol Tablets 12.5mg (Carvil)", unit: "Tablet", price: "1000" },
        { item: "Silver Nitrate Caustic Pencil", unit: "Pcs", price: "12,000" },
        { item: "Cefixime Capsules 400mg (Gramocef-O)", unit: "Capsule", price: "5000" },
        { item: "Daroxime Capsules 500mg", unit: "Tin", price: "26000" },
        { item: "Cef-2 200mg Tablets", unit: "Tablet", price: "3000" },
        { item: "Cef-3 DS 400mg Tablets (Cefixime)", unit: "Tablet", price: "6,000" },
        { item: "Cef-3 Syrup 100mg/5ml (Cefixime)", unit: "Syrup", price: "20,000" },
        { item: "Cefadroxil Tablets 125mg (Bludrox)", unit: "Tablet", price: "500" },
        { item: "Cefadroxil Tablets 250mg (Bludrox)", unit: "Tablets", price: "600" },
        { item: "Cefadroxil Capsules 500mg", unit: "Capsule", price: "800" },
        { item: "Cefadroxil Oral Suspension 250mg/5ml", unit: "Syrup", price: "16,000" },
        { item: "Cefalexin Oral Suspension 125mg/5ml (Cefamor)", unit: "Syrup", price: "10,000" },
        { item: "Cefepime Injection 1g", unit: "Injection", price: "30,000" },
        { item: "Cefixime Capsules 200mg (Cefix)", unit: "Capsule", price: "4,000" },
        { item: "Cefixime Capsules 400mg (Cefix/Mixif)", unit: "Capsule", price: "7,000" },
        { item: "Cefixime Oral Suspension 100mg/5ml (Cefix)", unit: "Syrup", price: "26,000" },
        { item: "Cefixime Dry Syrup 50mg/5ml (Gramocef-O)", unit: "Syrup", price: "26,000" },
        { item: "Cefixime Oral Suspension (Sanix)", unit: "Syrup", price: "15,000" },
        { item: "Cefixime Oral Suspension 100mg/5ml (Taxim-O)", unit: "Syrup", price: "18,000" },
        { item: "Cefixime Tablets 200mg (Gramocef-O)", unit: "Tablet", price: "3,500" },
        { item: "Clarithromycin Tablets 500mg (Klerimed)", unit: "Tablet", price: "3500" },
        { item: "Clarithromycin Tablets 500mg (Claranta)", unit: "Tablet", price: "2500" },
        { item: "Clarie OD 500mg Tablets", unit: "Tablet", price: "4000" },
        { item: "Clexane Injection 40mg (0.4ml)", unit: "Injection", price: "28,000" },
        { item: "Clexane Injection 60mg (0.6ml)", unit: "Injection", price: "68000" },
        { item: "Clindamycin Capsules 150mg", unit: "Capsule", price: "800" },
        { item: "Cloderm Cream", unit: "Cream", price: "8,000" },
        { item: "Clomid Tablets 50mg (Clomifene)", unit: "TABLETS", price: "3,000" },
        { item: "Clopidogrel Tablets 75mg (Noklot)", unit: "Tablet", price: "800" },
        { item: "Clotrimazole Vaginal Pessary 500mg (Candid V1)", unit: "Pessary", price: "7,000" },
        { item: "Clotrimazole Cream 15g (Unisten)", unit: "Cream", price: "2,000" },
        { item: "Clotrimazole Vaginal Pessary 100mg (Candid V6)", unit: "Pessary", price: "1,000" },
        { item: "Clotrimazole Dusting Powder (Candid)", unit: "Powder", price: "6,000" },
        { item: "Clotrimazole Cream (Mycoril)", unit: "Cream", price: "6,300" },
        { item: "Cloxacillin Capsules 250mg", unit: "Capsule", price: "200" },
        { item: "Cloxacillin Injection 500mg", unit: "Injection", price: "5,000" },
        { item: "Cloxacillin Syrup 125mg/5ml (100ml)", unit: "Syrup", price: "3,500" },
        { item: "Coartem 80mg/480mg Tablets (Pack of 24)", unit: "PKTS", price: "6,000" },
        { item: "Coartem Dispersible Paediatric Tablets 20mg/120mg (Pack of 12)", unit: "PKTS", price: "3,500" },
        { item: "Codeine Phosphate Tablets 30mg", unit: "Tablet", price: "800" },
        { item: "Co-codamol Tablets 8mg/500mg", unit: "Tablet", price: "1000" },
        { item: "Co-Artesiane Powder for Oral Suspension 180mg/60ml", unit: "Syrup", price: "28000" },
        { item: "Colchicine Tablets 500mcg (0.5mg)", unit: "Tablet", price: "1000" },
        { item: "Cofta Cough Lozenges", unit: "Pcs", price: "150" },
        { item: "ColdCap Capsules", unit: "Capsule", price: "400" },
        { item: "Coldafex Tablets", unit: "Tablet", price: "250" },
        { item: "ColdCap Syrup 100ml", unit: "Syrup", price: "4,500" },
        { item: "Coldease Syrup", unit: "Syrup", price: "4,000" },
        { item: "Combivent Nebules Solution", unit: "Nebule", price: "15,000" },
        { item: "Contus Linctus Syrup", unit: "Syrup", price: "5,000" },
        { item: "Co-trimoxazole Oral Suspension 240mg/5ml 100ml (Unitrim)", unit: "1", price: "3,500" },
        { item: "Co-trimoxazole Syrup 60ml (Unitrim)", unit: "Syrup", price: "2,500" },
        { item: "Co-trimoxazole Forte Tablets 960mg", unit: "Tablet", price: "200" },
        { item: "Co-trimoxazole Tablets 480mg", unit: "Tablet", price: "100" },
        { item: "Crestor 10mg Tablets (Rosuvastatin)", unit: "Tablet", price: "2,000" },
        { item: "Crestor 20mg Tablets (Rosuvastatin)", unit: "Tablet", price: "2,500" },
        { item: "Cytotec 200mcg Tablets (Misoprostol)", unit: "Tablet", price: "15000" },
        { item: "Cefixime Tablets 200mg (Taxim-O)", unit: "Tablet", price: "2,800" },
        { item: "Cefodox 200mg Tablets (Cefpodoxime)", unit: "Tablet", price: "3,500" },
        { item: "Cefodox Syrup 100mg/5ml", unit: "Syrup", price: "30,000" },
        { item: "Cefodox Syrup 50mg/5ml", unit: "Syrup", price: "28,000" },
        { item: "Cefpodoxime Oral Suspension 50mg/5ml 60ml (Tambac)", unit: "Syrup", price: "35,000" },
        { item: "Ceftriaxone Injection 1g", unit: "Injection", price: "7000" },
        { item: "Ceftriaxone + Sulbactam Injection 1.5g (Sanoxone)", unit: "Injection", price: "10,000" },
        { item: "Ceftriaxone Injection 1g (Epicephin)", unit: "Injection", price: "15,000" },
        { item: "Ceftriaxone Injection 1g (Medaxonum)", unit: "Injection", price: "18,000" },
        { item: "Ceftron Injection 1g (Ceftriaxone)", unit: "1", price: "15,000" },
        { item: "Cefuroxime Axetil 250mg Tablets (Proximexa)", unit: "Tablet", price: "2,500" },
        { item: "Cefuroxime Axetil Injection 1.5g", unit: "Injection", price: "20000" },
        { item: "Cefuroxime Axetil Tablets 250mg", unit: "Tablet", price: "3,000" },
        { item: "Cefuroxime Axetil Injection 750mg", unit: "Injection", price: "15,000" },
        { item: "Cefuroxime Axetil Tablets 500mg (Daroxime)", unit: "Tablet", price: "5,000" },
        { item: "Cefuroxime Axetil Oral Suspension 125mg/5ml", unit: "Syrup", price: "25,000" },
        { item: "Cefuroxime Axetil Tablets 250mg (Zinnat)", unit: "Tablet", price: "4,000" },
        { item: "Cefotaxime Sodium Injection 1g", unit: "Injection", price: "10,000" },
        { item: "Celecoxib Capsules 200mg (Zycel)", unit: "Capsule", price: "500" },
        { item: "Celestamine Tablets", unit: "Tablet", price: "1,200" },
        { item: "Cephalexin Capsules 250mg", unit: "1", price: "500" },
        { item: "Cerumol Ear Drops 11ml", unit: "Drops", price: "18,000" },
        { item: "Cetirizine Hydrochloride Tablets 10mg", unit: "Tablet", price: "200" },
        { item: "Cetirizine Syrup 5mg/5ml (Axcel)", unit: "Syrup", price: "5,000" },
        { item: "Activated Charcoal Tablets 0.25g (Adsocarb)", unit: "Tablet", price: "500" },
        { item: "Varicella (Chickenpox) Vaccine Injection", unit: "Injection", price: "120,000" },
        { item: "Chlorphenamine Maleate Tablets 4mg (Piriton)", unit: "Tablet", price: "100" },
        { item: "Chloramphenicol Ear Drops 0.5%", unit: "Drops", price: "2,500" },
        { item: "Chloramphenicol Syrup 125mg/5ml 100ml", unit: "Syrup", price: "5,000" },
        { item: "Chloramphenicol Eye Drops 0.5%", unit: "Drops", price: "2,500" },
        { item: "Chloramphenicol Sodium Succinate Injection 1g", unit: "Injection", price: "5,000" },
        { item: "Chlorpromazine Hydrochloride Injection 50mg/2ml", unit: "Injection", price: "5,000" },
        { item: "Cimetidine Tablets 200mg", unit: "Tablet", price: "200" },
        { item: "Ciprofloxacin Tablets 500mg", unit: "Tablet", price: "300" },
        { item: "Ciprodenk 500mg Tablets (Ciprofloxacin)", unit: "Tablet", price: "3500" },
        { item: "Ciprofloxacin Eye Drops 0.3% (Ciprobid)", unit: "Drops", price: "7,000" },
        { item: "Ciprofloxacin Intravenous Infusion 200mg/100ml", unit: "Injection", price: "7000" },
        { item: "Doxycycline Capsules 100mg", unit: "Capsule", price: "200" },
        { item: "Drez-V Vaginal Gel", unit: "Gel", price: "8,500" },
        { item: "Duo-Cortexin Tablets", unit: "PKTS", price: "12,000" },
        { item: "Duo-Cortexin Paediatric", unit: "PKTS", price: "13,000" },
        { item: "Duphaston Tablets 10mg (Dydrogesterone)", unit: "Tablet", price: "2,500" },
        { item: "Dynapar Tablets 50mg/500mg (Diclofenac / Paracetamol)", unit: "Tablet", price: "500" },
        { item: "Ebastine Tablets 10mg", unit: "Tablet", price: "600" },
        { item: "Ecocort Cream 15g", unit: "Cream", price: "8,000" },
        { item: "Ecodax-G Cream 15g", unit: "Cream", price: "5000" },
        { item: "Elocon Cream 15g (Mometasone)", unit: "Cream", price: "24,000" },
        { item: "Enemax Enema 100ml", unit: "Rectal Oil", price: "15,000" },
        { item: "Erythromycin Oral Suspension 125mg/5ml 100ml (Erythyl)", unit: "Syrup", price: "5,000" },
        { item: "Erythromycin Tablets 250mg", unit: "Tablet", price: "500" },
        { item: "Esomeprazole Tablets 40mg (Nexpro)", unit: "Tablet", price: "700" },
        { item: "Esomeprazole Capsules 20mg (Espra)", unit: "Capsule", price: "500" },
        { item: "Esomeprazole Tablets 20mg (Nexium)", unit: "Tablet", price: "4,500" },
        { item: "Esomeprazole Tablets 40mg (Nexium)", unit: "Tablet", price: "6,000" },
        { item: "Sulfadoxine/Pyrimethamine Tablets (Kamsidar/Fansidar)", unit: "Tablets", price: "2,000" },
        { item: "Fefol Vit-Spansule Capsules", unit: "Capsule", price: "200" },
        { item: "Fleming Oral Suspension 288.5mg (Amoxicillin/Clavulanate)", unit: "Syrup", price: "14,000" },
        { item: "Flexi Tablets 100mg (Aceclofenac)", unit: "Tablet", price: "500" },
        { item: "Flexilor SR 16mg Tablets (Lornoxicam)", unit: "Tablet", price: "800" },
        { item: "Flexilor 8mg Tablets (Lornoxicam)", unit: "Tablet", price: "600" },
        { item: "Flexilor-P Tablets 8mg/500mg (Lornoxicam/Paracetamol)", unit: "Tablet", price: "800" },
        { item: "Flora-Norm", unit: "Tablet", price: "3,000" },
        { item: "Flucamox Injection (Amoxicillin/Flucloxacillin)", unit: "Injection", price: "18,000" },
        { item: "Flucap Capsules (Fluconazole 150mg)", unit: "Capsule", price: "200" },
        { item: "Fluconazole Capsules 200mg (Flucazal)", unit: "Capsule", price: "1,500" },
        { item: "Folic Acid Tablets 5mg", unit: "Tablet", price: "100" },
        { item: "Fremol Caplets 500mg (Paracetamol)", unit: "Tablet", price: "200" },
        { item: "Furosemide Tablets 40mg (Agomide)", unit: "Tablet", price: "100" },
        { item: "Furosemide Injection 20mg/2ml", unit: "Injection", price: "3,000" },
        { item: "Gentamicin Eye Drops 0.3%", unit: "Drops", price: "2,500" },
        { item: "Gentamicin Injection 80mg/2ml", unit: "Injection", price: "5,000" },
        { item: "Ginsomin Capsules", unit: "Capsules", price: "1,500" },
        { item: "Glibenclamide Tablets 5mg (Betanase)", unit: "Tablet", price: "100" },
        { item: "Glimepiride Tablets 2mg (Amaryl)", unit: "Tablet", price: "2,500" },
        { item: "Glimepiride Tablets 4mg (Amaryl)", unit: "Tablet", price: "3,500" },
        { item: "Glycerine of Borax Paint 12%", unit: "Pcs", price: "2,000" },
        { item: "Glyceryl Trinitrate Sublingual Tablets 0.5mg", unit: "Tablet", price: "500" },
        { item: "Glycomet 1g Tablets (Metformin)", unit: "Tablet", price: "700" },
        { item: "Glycomet 500mg Tablets (Metformin)", unit: "Tablet", price: "500" },
        { item: "Good Morning Cough Syrup", unit: "Syrup", price: "2,500" },
        { item: "Gramocef-O Oral Suspension 100mg/5ml (Cefixime)", unit: "Syrup", price: "26,000" },
        { item: "Gramocef-O 400mg Capsules (Cefixime)", unit: "Capsule", price: "7,000" },
        { item: "Gravinate Tablets 50mg (Dimenhydrinate)", unit: "Tablet", price: "400" },
        { item: "Gravinate Syrup (Dimenhydrinate)", unit: "Syrup", price: "5,000" },
        { item: "Griseofulvin Tablets 500mg (Griseo)", unit: "Tablet", price: "500" },
        { item: "Haemofort Syrup 250ml", unit: "Syrup", price: "11,000" },
        { item: "Haemoforte Syrup 90ml", unit: "Syrup", price: "4,500" },
        { item: "Half Strength Darrow's Solution with 5% Dextrose 500ml", unit: "Pcs", price: "5,000" },
        { item: "Haloperidol Tablets 5mg (Haldol)", unit: "Tablet", price: "400" },
        { item: "Hedex Extra Tablets", unit: "Tablet", price: "250" },
        { item: "Heligo Combi Kit (Lansoprazole/Clarithromycin/Tinidazole)", unit: "Kit", price: "35,000" },
        { item: "Hepatitis B Vaccine Paediatric Injection", unit: "Injection", price: "38,000" },
        { item: "Hepatitis B Vaccine Recombinant Injection", unit: "Injection", price: "50,000" },
        { item: "Hydralazine Hydrochloride Injection 20mg/ml", unit: "Injection", price: "18,000" },
        { item: "Hydrocortisone Cream 1% 15g (Lucin)", unit: "Cream", price: "2,500" },
        { item: "Hydrocortisone Eye Drops 1% 5ml", unit: "Drops", price: "4,500" },
        { item: "Hydrocortisone Sodium Succinate Injection 100mg", unit: "Injection", price: "5,000" },
        { item: "Hyoscine Butylbromide Tablets 10mg (Bispanol)", unit: "Tablet", price: "300" },
        { item: "Ibumol Suspension 100ml (Ibuprofen/Paracetamol)", unit: "Syrup", price: "3,500" },
        { item: "Ibuprofen Paediatric Suspension 100ml (Fenpead)", unit: "Syrup", price: "12,000" },
        { item: "Ibuprofen Denk 400mg Tablets", unit: "Tablet", price: "600" },
        { item: "Ibuprofen Gel 5% 25g (Ibumex)", unit: "Gel", price: "8,000" },
        { item: "Ibuprofen Oral Suspension 100mg/5ml 100ml (Ibumex)", unit: "Syrup", price: "3,800" },
        { item: "Ibuprofen Oral Suspension 100mg/5ml 60ml (Ibumex)", unit: "Syrup", price: "2,500" },
        { item: "Ibuprofen Tablets 200mg (Ibumex)", unit: "Tablet", price: "100" },
        { item: "Ibuprofen/Paracetamol Tablets 400mg/325mg (Brustan)", unit: "Tablet", price: "500" },
        { item: "Ibuprofen/Paracetamol Tablets 400mg/325mg (Ibupar)", unit: "Tablet", price: "200" },
        { item: "Implanon NXT Contraceptive Implant", unit: "Implant", price: "50,000" },
        { item: "Indocid 25mg Capsules (Indometacin)", unit: "Capsule", price: "100" },
        { item: "Infacol Infant Drops 50ml", unit: "Drops", price: "35,000" },
        { item: "Injectaplan (Depo-Provera) Injection 150mg/ml", unit: "Injection", price: "3,000" },
        { item: "Insulin Human Injection 100 IU/ml", unit: "Injection", price: "5,000" },
        { item: "Mixtard 30 Human Insulin Injection 100 IU/ml", unit: "Injection", price: "17,500" },
        { item: "Actrapid Human Insulin Injection 100 IU/ml", unit: "Injection", price: "17500" },
        { item: "Intamine Cream 15g", unit: "Cream", price: "3,000" },
        { item: "i-Pill Emergency Contraceptive Tablet (Levonorgestrel 1.5mg)", unit: "PKTS", price: "10,000" },
        { item: "Intrauterine Contraceptive Device (Copper T IUD)", unit: "IUD", price: "50,000" },
        { item: "Morphine Sulfate Injection 15mg/ml", unit: "Injection", price: "12,000" },
        { item: "Jadelle Contraceptive Subdermal Implant System", unit: "Implant", price: "50,000" },
        { item: "Joint Care Capsules", unit: "PKTS", price: "220,000" },
        { item: "Ketoconazole Tablets 200mg", unit: "Tablet", price: "300" },
        { item: "Ketamine Hydrochloride Injection 50mg/ml", unit: "Injection", price: null },
        { item: "Lactulose Liquid Oral Solution 120ml", unit: "Syrup", price: "12,000" },
        { item: "Lansoprazole Capsules 30mg", unit: "Capsule", price: "700" },
        { item: "Levofloxacin Tablets 500mg", unit: "Tablet", price: "3,000" },
        { item: "Levofloxacin Intravenous Infusion 500mg/100ml", unit: "Injection", price: "15,000" },
        { item: "Lifeguard Condoms", unit: "PKTS", price: "1500" },
        { item: "Lisinopril Tablets 10mg (Listril)", unit: "Tablet", price: "600" },
        { item: "Lobak Tablets (Paracetamol/Chlorzoxazone/Diclofenac)", unit: "Tablet", price: "700" },
        { item: "Loperamide Hydrochloride Capsules 2mg (Gallop)", unit: "Capsule", price: "200" },
        { item: "Loratan Syrup (Loratadine)", unit: "Syrup", price: "12,000" },
        { item: "Loratadine Syrup 5mg/5ml 60ml (Mosedin)", unit: "Syrup", price: "15,000" },
        { item: "Loratadine Tablets 10mg (Loridin/Ezede)", unit: "Tablet", price: "700" },
        { item: "Losartan Potassium/Hydrochlorothiazide Tablets (Tozaar-H)", unit: "Tablet", price: "700" },
        { item: "Losartan Potassium/Hydrochlorothiazide Tablets 50mg/12.5mg (Losacar-H)", unit: "Tablet", price: "1000" },
        { item: "Losartan Potassium 50mg Tablets (Tozaar)", unit: "Tablet", price: "600" },
        { item: "Losartan Potassium Tablets 50mg (Losacar)", unit: "Tablet", price: "800" },
        { item: "Magnesium Sulphate Injection 50% (5g/10ml)", unit: "Injection", price: "15,000" },
        { item: "Magnomint Antacid Syrup 100ml", unit: "Syrup", price: "3,500" },
        { item: "Mannitol Intravenous Infusion 20% 500ml", unit: "Injection", price: "15,000" },
        { item: "MCG Triple Action Cream 15g", unit: "Cream", price: "6,000" },
        { item: "Mebendazole Chewable Tablets 100mg", unit: "Tablet", price: "100" },
        { item: "Mebendazole Oral Suspension 100mg/5ml (X-Pel)", unit: "Syrup", price: "3000" },
        { item: "MEBO Wound Repair Ointment", unit: "Ointment", price: "22,000" },
        { item: "Mediven Triple Action Cream 15g", unit: "Cream", price: "3,000" },
        { item: "Mefenamic Acid Tablets 500mg (Mefinal)", unit: "Tablet", price: "300" },
        { item: "Meloxicam Tablets 15mg (M-Cam)", unit: "Tablet", price: "300" },
        { item: "Mentho Plus Balm", unit: "PCS", price: "2,000" },
        { item: "Meropenem Injection 500mg (Meronia)", unit: "INJECTION", price: "80,000" },
        { item: "Meropenem Injection 1g (Meronia)", unit: "INJECTION", price: "150,000" },
        { item: "Metformin Hydrochloride Tablets 500mg (Brot)", unit: "Tablet", price: "500" },
        { item: "Tramadol Hydrochloride 50mg Tablets (Tramadex)", unit: "Tablet", price: "800" },
        { item: "Tramadol Hydrochloride Capsules 50mg", unit: "Capsule", price: "500" },
        { item: "Tramadol Hydrochloride Capsules 50mg (Tramazac)", unit: "Capsule", price: "500" },
        { item: "Tramadol Hydrochloride Injection 100mg/2ml (Tramazac)", unit: "Injection", price: "5,000" },
        { item: "Tramadol Hydrochloride Capsules 50mg (Tramexil)", unit: "Capsule", price: "1,200" },
        { item: "Tranexamic Acid Injection 500mg/5ml", unit: "Injection", price: "15,000" },
        { item: "Tranexamic Acid Tablets 500mg", unit: "Tablet", price: "1,200" },
        { item: "Tranexamic Acid Injection 250mg", unit: "Injection", price: "10,000" },
        { item: "Tranexamic Acid Capsules 500mg", unit: "Capsule", price: "1,500" },
        { item: "Typhoid Polysaccharide Vaccine Injection", unit: "Injection", price: "50,000" },
        { item: "Udihep 150mg Tablets (Ursodeoxycholic Acid)", unit: "Tablet", price: "2,000" },
        { item: "Udihep Forte 300mg Tablets (Ursodeoxycholic Acid)", unit: "Tablet", price: "2,000" },
        { item: "Vifex Cough Syrup 100ml", unit: "Syrup", price: "5000" },
        { item: "Viotic Ear Drops 5ml", unit: "Drops", price: "14,000" },
        { item: "Visco Expectorant Syrup 200ml", unit: "Syrup", price: "7,000" },
        { item: "Visco Tablets", unit: "Tablet", price: "300" },
        { item: "Vitamin A (Retinol) Capsules 200,000 IU", unit: "Capsule", price: "1,000" },
        { item: "Vitamin B-Complex Tablets (Combiplex)", unit: "Tablet", price: "100" },
        { item: "Vitamin B-Complex Denk Tablets", unit: "Tablet", price: "500" },
        { item: "Vitamin B-Complex Injection 10ml", unit: "Injection", price: "5,000" },
        { item: "Vitamin B12 (Cyanocobalamin) Injection 1000mcg/ml", unit: "Injection", price: "8,000" },
        { item: "Vitamin C (Ascorbic Acid) Tablets 100mg", unit: "Tablet", price: "100" },
        { item: "Vitamount Multivitamin Capsules for Men", unit: "PKTS", price: "15,000" },
        { item: "Vitamount Multivitamin Capsules for Women", unit: "PKTS", price: "15,000" },
        { item: "Vitane Liquid Infant Drops 30ml", unit: "Pcs", price: "28,000" },
        { item: "Vitona Multivitamin Capsules", unit: "Capsule", price: "2,500" },
        { item: "Viusid Oral Powder Sachets", unit: "Sachet", price: "6,000" },
        { item: "Vominore Tablets (Doxylamine/Pyridoxine)", unit: "Tablet", price: "700" },
        { item: "Vomiz 4mg Tablets (Ondansetron)", unit: "Tablet", price: "350" },
        { item: "Warfarin Sodium Tablets 5mg", unit: "Tablet", price: "500" },
        { item: "Xithrone 500mg Tablets (Azithromycin)", unit: "PKTS", price: "40,000" },
        { item: "Xithrone Oral Suspension (Azithromycin)", unit: "Syrup", price: "20,000" },
        { item: "Xylomepha 0.05% Paediatric Nasal Drops", unit: "Drops", price: "20,000" },
        { item: "Xylomepha 0.1% Adult Nasal Spray / Drops", unit: "Drops", price: "20,000" },
        { item: "Yellow Fever Vaccination Certificate Card", unit: "Pcs", price: "50,000" },
        { item: "Yellow Fever Vaccine Injection", unit: "Injection", price: "100,000" },
        { item: "Zecuf Herbal Cough Lozenges", unit: "Pcs", price: "500" },
        { item: "Zecuf Herbal Cough Syrup 100ml", unit: "Syrup", price: "3,500" },
        { item: "Deriva Adapalene Gel 0.1% 15g", unit: "Gel", price: "17000" },
        { item: "Dexamethasone Sodium Phosphate Eye Drops 0.1%", unit: "Drops", price: "2,500" },
        { item: "Dexamethasone Sodium Phosphate Injection 4mg/ml (Dexona)", unit: "Injection", price: "5,000" },
        { item: "Dexamethasone Tablets 0.5mg", unit: "Tablet", price: "100" },
        { item: "Dextrose Intravenous Infusion 5% 500ml", unit: "IV", price: "5,000" },
        { item: "Dextrose Intravenous Infusion 50% 100ml", unit: "IV", price: "5,000" },
        { item: "Diapiride 2mg Tablets (Glimepiride)", unit: "Tablet", price: "1500" },
        { item: "Diapiride 4mg Tablets (Glimepiride)", unit: "Tablet", price: "1800" },
        { item: "Diarrafin Oral Powder 3g", unit: "Pcs", price: "2,000" },
        { item: "Diazepam Injection 5mg/2ml", unit: "Injection", price: "5,000" },
        { item: "Diazepam Rectal Solution 2.5mg (Slipizem)", unit: "Rectal", price: "5,000" },
        { item: "Diazepam Tablets 5mg", unit: "Tablet", price: "200" },
        { item: "Diclodenk 100mg Tablets", unit: "Tablet", price: "700" },
        { item: "Diclodenk 50mg Tablets", unit: "Tablet", price: "300" },
        { item: "Diclofenac Sodium SR Capsules 100mg (Olfen)", unit: "Capsule", price: "3,500" },
        { item: "Diclofenac Sodium Injection 75mg/3ml (Dynapar)", unit: "Injection", price: "5000" },
        { item: "Diclofenac Sodium Tablets 50mg", unit: "Tablet", price: "100" },
        { item: "Digoxin Tablets 0.25mg", unit: "Tablet", price: "500" },
        { item: "Domperidone Oral Suspension 5mg/5ml", unit: "Syrup", price: "7000" },
        { item: "Diprofos Injection (Betamethasone Dipropionate/Sodium Phosphate)", unit: "Injection", price: "30,000" },
        { item: "Amoxicillin/Clavulanic Acid 1g Tablets (Dafraclav)", unit: "Tablet", price: "4,000" },
        { item: "Lisinopril Tablets 10mg (Dapril)", unit: "Tablet", price: "800" },
        { item: "Artemether/Lumefantrine Tablets 40mg/320mg (D-Artepp)", unit: "Tablet", price: "12,000" },
        { item: "Dazel Kit", unit: "Kit", price: "15,000" },
        { item: "Dapsone Tablets", unit: "Tablet", price: "4,500" },
        { item: "Aciclovir Cream 5g (Declovir)", unit: "Cream", price: "7,000" },
        { item: "Deep Heat Relief Cream 35g", unit: "Cream", price: "10,000" },
        { item: "Artemether/Lumefantrine Tablets (D-Artep)", unit: "Tablet", price: "20,000" },
        { item: "Deep Heat Spray", unit: "Spray", price: "18,000" },
        { item: "Delased Chesty Cough Syrup 100ml", unit: "Syrup", price: "6,000" },
        { item: "Delased Non-Drowsy Dry Cough Syrup 100ml", unit: "Syrup", price: "6,000" },
        { item: "Delased Dry Cough Syrup 100ml", unit: "Syrup", price: "5,000" },
        { item: "Delased Paediatric Cough Syrup 100ml", unit: "Syrup", price: "5,000" },
        { item: "Desloratadine Syrup 0.5mg/ml 100ml (Aerius)", unit: "Syrup", price: "35,000" },
        { item: "Desloratadine Tablets 5mg (Neoloratadine)", unit: "Tablet", price: "600" },
        { item: "Desloratadine Oral Solution/Syrup Small", unit: "Syrup", price: "17,500" },
        { item: "Desloratadine Tablets 5mg (Aerius)", unit: "Tablet", price: "2,300" },
    ];

    let drugsCreated = 0, drugsUpdated = 0, drugsSkipped = 0;
    for (const d of drugData) {
        const price = parsePrice(d.price);
        if (price == null) {
            console.log(`  SKIP (no price) ${d.item}`);
            drugsSkipped++;
            continue;
        }
        const drugCode = generateDrugCode(d.item);
        const strength = extractStrength(d.item);
        const categoryId = categorizeDrug(d.item, categories);
        const dosageForm = mapDosageForm(d.unit);

        const existing = await prisma.drug.findFirst({ where: { drugCode } });
        if (existing) {
            await prisma.drug.update({
                where: { id: existing.id },
                data: {
                    name: d.item,
                    genericName: deriveGeneric(d.item),
                    categoryId,
                    dosageForm,
                    strength: strength.strength,
                    strengthValue: strength.value,
                    strengthUnit: strength.unit,
                    packageUnit: d.unit || 'Unit',
                    schedule: DrugSchedule.PRESCRIPTION,
                    storage: StorageCondition.ROOM_TEMP,
                }
            });
            drugsUpdated++;
        } else {
            await prisma.drug.create({
                data: {
                    drugCode,
                    name: d.item,
                    genericName: deriveGeneric(d.item),
                    categoryId,
                    dosageForm,
                    strength: strength.strength,
                    strengthValue: strength.value,
                    strengthUnit: strength.unit,
                    packageSize: 1,
                    packageUnit: d.unit || 'Unit',
                    schedule: DrugSchedule.PRESCRIPTION,
                    storage: StorageCondition.ROOM_TEMP,
                }
            });
            drugsCreated++;
        }

        // Add initial batch if not exists
        const drug = existing ?? await prisma.drug.findFirst({ where: { drugCode } });
        if (drug) {
            const batchNum = `BATCH-${drugCode}-01`;
            const existingBatch = await prisma.drugBatch.findFirst({ where: { drugId: drug.id, batchNumber: batchNum } });
            if (!existingBatch) {
                await prisma.drugBatch.create({
                    data: {
                        drugId: drug.id,
                        batchNumber: batchNum,
                        expiryDate: new Date('2026-12-31'),
                        quantityReceived: 100,
                        quantityRemaining: 100,
                        purchasePrice: price * 0.6,
                        sellingPrice: price,
                    }
                });
            }

            // Add/update REGULAR price
            const existingPrice = await prisma.drugPrice.findFirst({
                where: { drugId: drug.id, priceType: 'REGULAR', isActive: true, effectiveTo: null }
            });
            if (existingPrice) {
                await prisma.drugPrice.update({ where: { id: existingPrice.id }, data: { price } });
            } else {
                await prisma.drugPrice.updateMany({
                    where: { drugId: drug.id, priceType: 'REGULAR', effectiveTo: null },
                    data: { effectiveTo: new Date() }
                });
                await prisma.drugPrice.create({
                    data: {
                        drugId: drug.id,
                        priceType: 'REGULAR',
                        price,
                        isActive: true,
                        effectiveFrom: new Date(),
                    }
                });
            }
        }
    }
    console.log(`  Drugs: created ${drugsCreated}, updated ${drugsUpdated}, skipped ${drugsSkipped}`);

    // 4. Lab Categories & Tests
    console.log('Seeding Lab Catalog...');
    const labCategoryData = [
        { name: 'Hematology', description: 'Blood-related tests' },
        { name: 'Serology', description: 'Serum and antibody tests' },
        { name: 'Biochemistry', description: 'Chemical analysis of bodily fluids' },
        { name: 'Microbiology', description: 'Microorganisms and infections' },
        { name: 'Endocrinology', description: 'Hormonal and endocrine function tests' },
    ];

    const labCategories: Record<string, string> = {};
    for (const cat of labCategoryData) {
        const createdCat = await prisma.labCategory.upsert({
            where: { name: cat.name },
            update: { description: cat.description },
            create: cat
        });
        labCategories[cat.name] = createdCat.id;
    }

    // Helper: categorize lab test by name keywords
    const categorizeLab = (name: string, cats: Record<string, string>): string => {
        const n = name.toLowerCase();
        // Endocrinology: hormone tests
        if (n.match(/tsh|ft3|ft4|thyroid|hcg|hormone|insulin|prolactin|cortisol|estradiol|testosterone|progesterone|afp|psa|cea|ferritin/)) return cats['Endocrinology'];
        // Microbiology: cultures, stool, urine, pus, sputum, HVS
        if (n.match(/culture|urine|stool|spu tum|spu tum|hvs|pus|gram stain|helicobacter pylori antigen|rotavirus/)) return cats['Microbiology'];
        // Serology: hepatitis, HIV, antibodies, Widal
        if (n.match(/hepatitis|hiv|hbsag|widal|treponema|tpha|helicobacter pylori antibody|cryptococcal|h\. pylori serum|serum|antibody|igg|igm|vdrl/)) return cats['Serology'];
        // Hematology: blood, CBC, ESR, malaria slide, blood grouping, hemoglobin, blood film
        if (n.match(/blood|cbc|fbc|esr|malaria slide|hemoglobin|blood grouping|cd4|bat|brucella|peripheral blood|ddimer|d-dimer/)) return cats['Hematology'];
        // Biochemistry: sugar, liver, kidney, lipid, amylase, lipase
        if (n.match(/sugar|glucose|liver|rft|renal|amylase|lipase|lipid profile|lft/)) return cats['Biochemistry'];
        return cats['Hematology']; // default
    };

    const labData = [
        { test: "Complete Blood Count (CBC)", price: "15,000" },
        { test: "Blood Grouping", price: "10,000" },
        { test: "Blood Slide for Malaria Parasites (BS)", price: "5,000" },
        { test: "Blood Culture & Sensitivity (Blood C&S)", price: "100,000" },
        { test: "Brucella Agglutination Test (BAT)", price: "10,000" },
        { test: "CD4 Count", price: "15,000" },
        { test: "COVID-19 Antigen Test", price: "80,000" },
        { test: "COVID-19 PCR Test", price: "200,000" },
        { test: "C-Reactive Protein (CRP)", price: "80,000" },
        { test: "D-Dimer", price: "150,000" },
        { test: "Erythrocyte Sedimentation Rate (ESR)", price: "15,000" },
        { test: "Gram Stain", price: "10,000" },
        { test: "Hemoglobin Electrophoresis", price: "60,000" },
        { test: "Glycated Hemoglobin (HbA1c)", price: "60,000" },
        { test: "Hepatitis B Surface Antigen (HBsAg)", price: "10,000" },
        { test: "Hepatitis C Antibody (Hep C)", price: "10,000" },
        { test: "Human Immunodeficiency Virus (HIV) Test", price: "10,000" },
        { test: "High Vaginal Swab Wet Prep (HVS)", price: "10,000" },
        { test: "High Vaginal Swab Culture & Sensitivity (HVS C&S)", price: "80,000" },
        { test: "Liver Function Test (LFT)", price: "50,000" },
        { test: "Lipid Profile", price: "75,000" },
        { test: "Peripheral Blood Film Comment", price: "15,000" },
        { test: "Prostate-Specific Antigen (PSA)", price: "60,000" },
        { test: "Pus Culture & Sensitivity (Pus C&S)", price: "100,000" },
        { test: "Random/Fasting Blood Sugar (RBS/FBS)", price: "5,000" },
        { test: "Malaria Rapid Diagnostic Test (RDT)", price: "7,000" },
        { test: "Renal Function Test (RFT)", price: "50,000" },
        { test: "Rheumatoid Factor", price: "18,000" },
        { test: "Rotavirus & Adenovirus Antigen Test", price: "16,000" },
        { test: "Serum Amylase", price: "50,000" },
        { test: "Serum Vitamin B12", price: "80,000" },
        { test: "Serum Cryptococcal Antigen (CrAg)", price: "40,000" },
        { test: "Serum Helicobacter pylori Antibody", price: "15,000" },
        { test: "Serum Human Chorionic Gonadotropin (Serum hCG)", price: "8,000" },
        { test: "Serum Lipase", price: "50,000" },
        { test: "Sputum Analysis", price: "10,000" },
        { test: "Stool Helicobacter pylori Antigen", price: "15,000" },
        { test: "Free Triiodothyronine (FT3)", price: "60,000" },
        { test: "Free Thyroxine (FT4)", price: "60,000" },
        { test: "Thyroid-Stimulating Hormone (TSH)", price: "50,000" },
        { test: "Typhoid IgG/IgM & Widal Test", price: "10,000" },
        { test: "Urinalysis", price: "6,000" },
        { test: "Urine Culture & Sensitivity (Urine C&S)", price: "50,000" },
        { test: "Urine Human Chorionic Gonadotropin (Urine hCG)", price: "5,000" },
        { test: "Treponema Pallidum Hemagglutination Assay (TPHA)", price: "8,000" },
        { test: "Quantitative Human Chorionic Gonadotropin (Quantitative hCG)", price: "65,000" }
    ];

    let labsCreated = 0, labsUpdated = 0;
    for (const l of labData) {
        const price = parsePrice(l.price);
        if (price == null) continue;
        const categoryId = categorizeLab(l.test, labCategories);
        const existing = await prisma.labTestCatalog.findFirst({ where: { name: l.test } });
        if (existing) {
            await prisma.labTestCatalog.update({
                where: { id: existing.id },
                data: { price, categoryId, unit: 'N/A' }
            });
            labsUpdated++;
        } else {
            await prisma.labTestCatalog.create({
                data: { name: l.test, categoryId, price, unit: 'N/A' }
            });
            labsCreated++;
        }
    }
    console.log(`  Lab tests: created ${labsCreated}, updated ${labsUpdated}`);

    // 5. Insurance Companies & Rules
    console.log('Seeding Insurance Data...');
    const companies = [
        { name: 'Jubilee Insurance', code: 'JUB' },
        { name: 'AAR Insurance', code: 'AAR' },
        { name: 'Sanlam Health', code: 'SNL' },
        { name: 'UAP Old Mutual', code: 'UAP' }
    ];

    for (const c of companies) {
        const company = await prisma.insuranceCompany.upsert({
            where: { code: c.code },
            update: {},
            create: { name: c.name, code: c.code, isActive: true, paymentTerms: 'Net 30' }
        });

        // Add default negotiated rate for lab tests
        await prisma.insurancePriceListItem.create({
          data: {
            insuranceId: company.id,
            serviceType: ServiceType.LAB_TEST,
            negotiatedPrice: 20000
          }
        });
    }

    // 6. Patients
    console.log('Seeding Patients...');
    // Clear existing for clean run since we use fixed IDs in create
    // Actually we use upsert, but the relations might be sticky
    
    // Get Jubilee for linking
    const jubilee = await prisma.insuranceCompany.findFirst({ where: { code: 'JUB' } });

    const patients = [
        { id: 'p1', first: 'John', last: 'Doe', dob: '1985-05-15', gender: 'Male', phone: '0772111222', ins: true },
        { id: 'p2', first: 'Jane', last: 'Smith', dob: '1992-08-22', gender: 'Female', phone: '0781333444', ins: true },
        { id: 'p3', first: 'Samuel', last: 'Muwanguzi', dob: '1978-03-10', gender: 'Male', phone: '0702555666', ins: false },
        { id: 'p4', first: 'Amina', last: 'Nakato', dob: '2000-11-05', gender: 'Female', phone: '0754777888', ins: true },
        { id: 'p5', first: 'Robert', last: 'Okello', dob: '1965-01-30', gender: 'Male', phone: '0712999000', ins: false },
        { id: 'p6', first: 'Grace', last: 'Akello', dob: '1995-07-12', gender: 'Female', phone: '0773123456', ins: true },
        { id: 'p7', first: 'Peter', last: 'Otim', dob: '1988-12-25', gender: 'Male', phone: '0784234567', ins: true },
        { id: 'p8', first: 'Sarah', last: 'Namukasa', dob: '1990-04-18', gender: 'Female', phone: '0705345678', ins: false },
        { id: 'p9', first: 'David', last: 'Bwambale', dob: '1982-09-02', gender: 'Male', phone: '0756456789', ins: true },
        { id: 'p10', first: 'Fatuma', last: 'Hassan', dob: '1998-06-20', gender: 'Female', phone: '0712567890', ins: true },
        { id: 'p11', first: 'James', last: 'Kato', dob: '1975-10-15', gender: 'Male', phone: '0778678901', ins: false },
        { id: 'p12', first: 'Alice', last: 'Nalunga', dob: '1987-02-28', gender: 'Female', phone: '0789789012', ins: true },
        { id: 'p13', first: 'Moses', last: 'Baluku', dob: '1993-12-05', gender: 'Male', phone: '0700890123', ins: true },
        { id: 'p14', first: 'Rachael', last: 'Atugonza', dob: '2002-03-14', gender: 'Female', phone: '0751901234', ins: false },
        { id: 'p15', first: 'Isaac', last: 'Wanyama', dob: '1980-01-01', gender: 'Male', phone: '0712012345', ins: true },
    ];

    for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        await prisma.patient.upsert({
            where: { patientNumber: `P-000${i + 1}` },
            update: {},
            create: {
                patientNumber: `P-000${i + 1}`,
                firstName: p.first,
                lastName: p.last,
                dateOfBirth: new Date(p.dob),
                gender: p.gender,
                phone: p.phone,
                address: 'Kampala, Uganda',
                hasInsurance: p.ins,
                insuranceId: p.ins ? jubilee?.id : null,
                isActive: true,
                bloodGroup: ['A+', 'B+', 'O+', 'AB+'][Math.floor(Math.random() * 4)],
            }
        });
    }

    console.log('--- Seeding Comprehensive Success ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
