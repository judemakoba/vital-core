import { PrismaClient, AccountType, AccountCategory, TaxType } from '../lib/generated-prisma';

const prisma = new PrismaClient();

const chartOfAccounts = [
    // === ASSETS ===
    { accountCode: '1000', accountName: 'ASSETS', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, isControlAccount: true, description: 'All Asset accounts' },

    // Current Assets
    { accountCode: '1100', accountName: 'Current Assets', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, isControlAccount: true, parentCode: '1000' },
    { accountCode: '1110', accountName: 'Cash at Hand', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Physical cash in clinic' },
    { accountCode: '1111', accountName: 'Petty Cash', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Petty cash fund' },
    { accountCode: '1120', accountName: 'Cash at Bank - UGX', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Main bank account (Uganda Shillings)' },
    { accountCode: '1121', accountName: 'Cash at Bank - USD', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'USD bank account' },
    { accountCode: '1130', accountName: 'Accounts Receivable', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', isControlAccount: true, description: 'Trade debtors / patient receivables' },
    { accountCode: '1131', accountName: 'Patient Receivables', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1130', description: 'Amounts owed by patients for services' },
    { accountCode: '1132', accountName: 'Insurance Receivables', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1130', description: 'Amounts owed by insurance companies' },
    { accountCode: '1140', accountName: 'Inventory - Drugs & Supplies', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Pharmacy stock and medical supplies' },
    { accountCode: '1150', accountName: 'Prepaid Expenses', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Expenses paid in advance' },
    { accountCode: '1160', accountName: 'VAT Recoverable', accountType: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '1100', description: 'Input VAT claimable from URA' },

    // Fixed Assets
    { accountCode: '1200', accountName: 'Fixed Assets', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, isControlAccount: true, parentCode: '1000' },
    { accountCode: '1210', accountName: 'Medical Equipment', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200', description: 'Clinical equipment and machines' },
    { accountCode: '1211', accountName: 'Accumulated Depreciation - Medical Equipment', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1220', accountName: 'Furniture & Fittings', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1221', accountName: 'Accumulated Depreciation - Furniture', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1230', accountName: 'Computer Equipment & Software', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1231', accountName: 'Accumulated Depreciation - Computers', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1240', accountName: 'Motor Vehicles', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },
    { accountCode: '1241', accountName: 'Accumulated Depreciation - Vehicles', accountType: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '1200' },

    // === LIABILITIES ===
    { accountCode: '2000', accountName: 'LIABILITIES', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, isControlAccount: true, description: 'All Liability accounts' },

    // Current Liabilities
    { accountCode: '2100', accountName: 'Current Liabilities', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, isControlAccount: true, parentCode: '2000' },
    { accountCode: '2110', accountName: 'Accounts Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', description: 'Amounts owed to suppliers' },
    { accountCode: '2111', accountName: 'Drug Suppliers Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100' },
    { accountCode: '2120', accountName: 'VAT Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', description: 'Output VAT owed to URA', isTaxApplicable: true },
    { accountCode: '2130', accountName: 'Withholding Tax Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', isTaxApplicable: true },
    { accountCode: '2140', accountName: 'NSSF Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', description: 'Employee & Employer NSSF contributions' },
    { accountCode: '2150', accountName: 'PAYE Payable', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', description: 'Pay As You Earn tax liability' },
    { accountCode: '2160', accountName: 'Accrued Expenses', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100' },
    { accountCode: '2170', accountName: 'Deferred Revenue', accountType: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '2100', description: 'Prepaid consultations or packages' },

    // Long-term Liabilities
    { accountCode: '2200', accountName: 'Long-Term Liabilities', accountType: AccountType.LIABILITY, category: AccountCategory.LONG_TERM_LIABILITY, isControlAccount: true, parentCode: '2000' },
    { accountCode: '2210', accountName: 'Bank Loans', accountType: AccountType.LIABILITY, category: AccountCategory.LONG_TERM_LIABILITY, parentCode: '2200' },

    // === EQUITY ===
    { accountCode: '3000', accountName: 'EQUITY', accountType: AccountType.EQUITY, category: AccountCategory.OWNERS_EQUITY, isControlAccount: true, description: 'Owner equity and retained earnings' },
    { accountCode: '3100', accountName: "Owner's Capital", accountType: AccountType.EQUITY, category: AccountCategory.OWNERS_EQUITY, parentCode: '3000' },
    { accountCode: '3200', accountName: 'Retained Earnings', accountType: AccountType.EQUITY, category: AccountCategory.RETAINED_EARNINGS, parentCode: '3000', description: 'Accumulated profits/losses' },
    { accountCode: '3300', accountName: 'Current Year Earnings', accountType: AccountType.EQUITY, category: AccountCategory.RETAINED_EARNINGS, parentCode: '3000' },

    // === REVENUE ===
    { accountCode: '4000', accountName: 'REVENUE', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, isControlAccount: true, description: 'All revenue accounts' },

    // Clinical Revenue
    { accountCode: '4100', accountName: 'Clinical Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, isControlAccount: true, parentCode: '4000' },
    { accountCode: '4110', accountName: 'Consultation Fees', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4100', description: 'Doctor consultation charges' },
    { accountCode: '4111', accountName: 'General Consultation', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4110' },
    { accountCode: '4112', accountName: 'Specialist Consultation', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4110' },
    { accountCode: '4120', accountName: 'Laboratory Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4100', description: 'Lab test charges' },
    { accountCode: '4130', accountName: 'Pharmacy Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4100', description: 'Drug & supply dispensing revenue' },
    { accountCode: '4140', accountName: 'Procedure Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4100', description: 'Minor surgery, injections, dressings' },
    { accountCode: '4150', accountName: 'Radiology Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4100', description: 'X-ray, ultrasound, imaging' },

    // Insurance Revenue
    { accountCode: '4200', accountName: 'Insurance Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, isControlAccount: true, parentCode: '4000' },
    { accountCode: '4210', accountName: 'Insurance Claims Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '4200' },

    // Other Revenue
    { accountCode: '4900', accountName: 'Other Revenue', accountType: AccountType.REVENUE, category: AccountCategory.OTHER_REVENUE, parentCode: '4000' },
    { accountCode: '4910', accountName: 'Interest Income', accountType: AccountType.REVENUE, category: AccountCategory.OTHER_REVENUE, parentCode: '4900' },
    { accountCode: '4920', accountName: 'Miscellaneous Income', accountType: AccountType.REVENUE, category: AccountCategory.OTHER_REVENUE, parentCode: '4900' },

    // === EXPENSES ===
    { accountCode: '5000', accountName: 'EXPENSES', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, isControlAccount: true, description: 'All expense accounts' },

    // Cost of Services (Direct)
    { accountCode: '5100', accountName: 'Cost of Services', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, isControlAccount: true, parentCode: '5000' },
    { accountCode: '5110', accountName: 'Cost of Drugs Dispensed', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5100', description: 'COGS for pharmacy dispensing' },
    { accountCode: '5120', accountName: 'Laboratory Supplies Cost', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5100', description: 'Reagents and lab consumables' },
    { accountCode: '5130', accountName: 'Medical Supplies & Consumables', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5100' },
    { accountCode: '5140', accountName: 'Referral Costs', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5100' },

    // Staff Costs
    { accountCode: '5200', accountName: 'Staff Costs', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, isControlAccount: true, parentCode: '5000' },
    { accountCode: '5210', accountName: 'Salaries - Doctors', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5200' },
    { accountCode: '5220', accountName: 'Salaries - Nurses', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5200' },
    { accountCode: '5230', accountName: 'Salaries - Admin Staff', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5200' },
    { accountCode: '5240', accountName: 'NSSF Contributions', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5200' },
    { accountCode: '5250', accountName: 'Staff Medical Benefits', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5200' },

    // Operating Expenses
    { accountCode: '5300', accountName: 'Operating Expenses', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, isControlAccount: true, parentCode: '5000' },
    { accountCode: '5310', accountName: 'Rent & Premises', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5320', accountName: 'Utilities - Electricity', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5321', accountName: 'Utilities - Water', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5330', accountName: 'Telecommunications', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300', description: 'Internet, phone, SMS costs' },
    { accountCode: '5340', accountName: 'Equipment Maintenance', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5350', accountName: 'Cleaning & Sanitation', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5360', accountName: 'Security Services', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5370', accountName: 'Transport & Vehicle Costs', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5380', accountName: 'Stationery & Office Supplies', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },
    { accountCode: '5390', accountName: 'Printing & Photocopying', accountType: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '5300' },

    // Admin & Professional
    { accountCode: '5400', accountName: 'Admin & Professional Fees', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, isControlAccount: true, parentCode: '5000' },
    { accountCode: '5410', accountName: 'Accounting & Audit Fees', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5420', accountName: 'Legal Fees', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5430', accountName: 'License & Registration Fees', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5440', accountName: 'Insurance Premiums', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5450', accountName: 'Bank Charges & Fees', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5460', accountName: 'Depreciation', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5470', accountName: 'Advertising & Marketing', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5480', accountName: 'Training & Staff Development', accountType: AccountType.EXPENSE, category: AccountCategory.ADMIN_EXPENSE, parentCode: '5400' },
    { accountCode: '5490', accountName: 'Miscellaneous Expenses', accountType: AccountType.EXPENSE, category: AccountCategory.OTHER_EXPENSE, parentCode: '5000' },
];

const taxRates = [
    {
        name: 'VAT Standard Rate',
        code: 'VAT18',
        rate: 18,
        isPercentage: true,
        taxType: TaxType.VAT,
        description: 'Uganda Revenue Authority Standard VAT Rate 18%',
        effectiveFrom: new Date('2020-01-01'),
    },
    {
        name: 'VAT Exempt (Medical)',
        code: 'VAT0',
        rate: 0,
        isPercentage: true,
        taxType: TaxType.VAT,
        description: 'VAT exempt for medical services as per Uganda VAT Act',
        effectiveFrom: new Date('2020-01-01'),
    },
    {
        name: 'Withholding Tax 6%',
        code: 'WHT6',
        rate: 6,
        isPercentage: true,
        taxType: TaxType.WITHHOLDING,
        description: 'Withholding tax on professional services (URA)',
        effectiveFrom: new Date('2020-01-01'),
    },
    {
        name: 'NIL Tax Rate',
        code: 'NIL',
        rate: 0,
        isPercentage: true,
        taxType: TaxType.NIL,
        description: 'No tax applicable',
        effectiveFrom: new Date('2020-01-01'),
    },
];

async function seedFinance() {
    console.log('🏦 Seeding financial data...');

    // 1. Seed Tax Rates first
    console.log('  📊 Seeding tax rates...');
    for (const taxRate of taxRates) {
        await prisma.taxRate.upsert({
            where: { code: taxRate.code },
            update: taxRate,
            create: taxRate,
        });
    }
    console.log(`  ✅ ${taxRates.length} tax rates seeded`);

    // 2. Build a code→id map after creating parent accounts first
    const codeToId: Record<string, string> = {};

    // Sort so parents come before children (no parentCode = root)
    const sorted = [
        ...chartOfAccounts.filter(a => !a.parentCode),
        ...chartOfAccounts.filter(a => a.parentCode),
    ];

    console.log('  📋 Seeding Chart of Accounts...');
    for (const account of sorted) {
        const { parentCode, ...data } = account as any;
        const parentId = parentCode ? codeToId[parentCode] : undefined;

        const record = await prisma.chartOfAccount.upsert({
            where: { accountCode: data.accountCode },
            update: { ...data, parentId: parentId ?? null },
            create: { ...data, parentId: parentId ?? null },
        });
        codeToId[data.accountCode] = record.id;
    }
    console.log(`  ✅ ${chartOfAccounts.length} accounts seeded`);

    // 3. Seed current Fiscal Year
    console.log('  📅 Seeding fiscal year...');
    const currentYear = new Date().getFullYear();
    const fiscalYear = await prisma.fiscalYear.upsert({
        where: { id: `fy-${currentYear}` },
        update: {},
        create: {
            id: `fy-${currentYear}`,
            name: `FY ${currentYear}/${currentYear + 1}`,
            startDate: new Date(`${currentYear}-07-01`),
            endDate: new Date(`${currentYear + 1}-06-30`),
        },
    });

    // Seed 12 monthly periods
    for (let i = 1; i <= 12; i++) {
        const periodStart = new Date(fiscalYear.startDate);
        periodStart.setMonth(periodStart.getMonth() + (i - 1));
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        periodEnd.setDate(0); // last day of month

        await prisma.accountingPeriod.upsert({
            where: { id: `fy-${currentYear}-p${i}` },
            update: {},
            create: {
                id: `fy-${currentYear}-p${i}`,
                fiscalYearId: fiscalYear.id,
                periodType: 'MONTHLY',
                periodNumber: i,
                startDate: periodStart,
                endDate: periodEnd,
            },
        });
    }
    console.log(`  ✅ Fiscal year ${fiscalYear.name} and 12 periods seeded`);

    console.log('\n✅ Financial seed complete!');
}

seedFinance()
    .catch(e => {
        console.error('❌ Finance seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
