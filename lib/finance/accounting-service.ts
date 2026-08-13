import { prisma } from '../prisma';
import { ReferenceType, JournalStatus } from '../generated-prisma';

export class AccountingService {
    /**
     * Posts an invoice to the general ledger. Auto-detects TaxInvoice vs legacy Invoice.
     * Debit: Accounts Receivable (1131 or 1132)
     * Credit: General Revenue (4100)
     */
    static async postInvoiceToLedger(invoiceId: string, userId: string) {
        // Try TaxInvoice first (newer URA-compliant model)
        const taxInvoice = await prisma.taxInvoice.findUnique({
            where: { id: invoiceId },
            include: { lines: true, patient: true },
        });
        if (taxInvoice) {
            return this.postTaxInvoiceToLedger(taxInvoice, userId);
        }

        // Fall back to legacy Invoice (visit-based billing)
        const legacyInvoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { items: true, patient: true },
        });
        if (legacyInvoice) {
            return this.postLegacyInvoiceToLedger(legacyInvoice, userId);
        }

        throw new Error(`Invoice ${invoiceId} not found in either taxInvoice or invoice table`);
    }

    /**
     * Map invoice line itemType to a specific revenue account code.
     * If the line's revenueAccountId is set, prefer that. Otherwise use itemType.
     * Falls back to 4100 (control) if no specific mapping is found.
     */
    private static async buildRevenueLines(tx: any, invoice: any, totalAmount: number) {
        // Default fallback: 4100 Clinical Revenue (control)
        const fallback = await tx.chartOfAccount.findUnique({ where: { accountCode: '4100' } });
        if (!fallback) throw new Error('Revenue account 4100 not found in chart of accounts');

        // If no line breakdown, just credit 4100
        if (!invoice.lines || invoice.lines.length === 0) {
            return [{
                accountId: fallback.id,
                debitAmount: 0,
                creditAmount: totalAmount,
                description: `Revenue from ${invoice.invoiceNumber}`,
            }];
        }

        // Group lines by effective revenue account
        const accountTotals = new Map<string, { accountId: string; accountName: string; amount: number; lineCount: number }>();
        for (const line of invoice.lines) {
            // 1. If line has explicit revenueAccountId, use it
            let account = line.revenueAccountId
                ? await tx.chartOfAccount.findUnique({ where: { id: line.revenueAccountId } })
                : null;
            // 2. Otherwise map by itemType
            if (!account) {
                const code = this.itemTypeToRevenueCode(line.itemType);
                if (code) {
                    account = await tx.chartOfAccount.findUnique({ where: { accountCode: code } });
                }
            }
            // 3. Fall back to 4100
            if (!account) account = fallback;

            // For credit notes, lineTotal is already negative
            const amount = Math.abs(line.lineTotal ?? 0);
            if (amount === 0) continue;

            const existing = accountTotals.get(account.id);
            if (existing) {
                existing.amount += line.lineTotal ?? 0; // preserves sign for credit notes
                existing.lineCount += 1;
            } else {
                accountTotals.set(account.id, {
                    accountId: account.id,
                    accountName: account.accountName,
                    amount: line.lineTotal ?? 0,
                    lineCount: 1,
                });
            }
        }

        // If everything went to fallback, just return one line
        if (accountTotals.size === 0 || (accountTotals.size === 1 && accountTotals.has(fallback.id))) {
            return [{
                accountId: fallback.id,
                debitAmount: 0,
                creditAmount: totalAmount,
                description: `Revenue from ${invoice.invoiceNumber}`,
            }];
        }

        const lines: any[] = [];
        for (const [, info] of accountTotals) {
            lines.push({
                accountId: info.accountId,
                debitAmount: 0,
                creditAmount: info.amount,
                description: `Revenue (${info.accountName}) — ${invoice.invoiceNumber} · ${info.lineCount} line${info.lineCount > 1 ? 's' : ''}`,
            });
        }
        return lines;
    }

    /**
     * Map an InvoiceLine.itemType to a leaf revenue account code.
     * Returns null for unknown types so caller can fall back to 4100.
     */
    private static itemTypeToRevenueCode(itemType: string | null | undefined): string | null {
        if (!itemType) return null;
        const t = String(itemType).toUpperCase();
        // Match the LineItemType enum in schema.prisma
        if (t.includes('CONSULT') || t === 'SERVICE' || t === 'CONSULTATION') return '4110'; // Consultation Fees
        if (t.includes('LAB') || t === 'LAB_TEST' || t === 'LABORATORY') return '4120';       // Laboratory Revenue
        if (t.includes('PHARM') || t === 'DRUG' || t === 'MEDICATION') return '4130';         // Pharmacy Revenue
        if (t.includes('PROC') || t === 'PROCEDURE') return '4140';                            // Procedure Revenue
        if (t.includes('RAD') || t === 'IMAGING') return '4150';                               // Radiology Revenue
        if (t === 'OTHER') return '4900';                                                     // Other Revenue
        return null;
    }

    private static async postTaxInvoiceToLedger(invoice: any, userId: string) {
        // 1. Determine accounts
        const arAccountCode = '1131';
        const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: arAccountCode } });
        if (!arAccount) throw new Error(`Accounts Receivable account (${arAccountCode}) not found`);

        // 2. Create Journal Entry — distribute revenue across leaf accounts by item type
        const journalNumber = `JNL-INV-${invoice.invoiceNumber}`;

        return await prisma.$transaction(async (tx) => {
            // Idempotency
            const existing = await tx.journalEntry.findFirst({
                where: { reference: invoice.id, referenceType: 'INVOICE' },
            });
            if (existing) return existing;

            const revenueLines = await this.buildRevenueLines(tx, invoice, invoice.totalAmount);

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: journalNumber,
                    entryDate: invoice.invoiceDate,
                    postingDate: new Date(),
                    description: `Automated posting for Invoice ${invoice.invoiceNumber}`,
                    reference: invoice.id,
                    referenceType: 'INVOICE',
                    totalDebit: invoice.totalAmount,
                    totalCredit: invoice.totalAmount,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: arAccount.id,
                                debitAmount: invoice.totalAmount,
                                creditAmount: 0,
                                description: `AR - ${invoice.customerName || (invoice.patient ? `${invoice.patient.firstName} ${invoice.patient.lastName}` : 'Patient')}`,
                            },
                            ...revenueLines,
                        ],
                    },
                },
            });

            await tx.taxInvoice.update({
                where: { id: invoice.id },
                data: { journalEntryId: journal.id },
            });

            return journal;
        });
    }

    private static async postLegacyInvoiceToLedger(invoice: any, userId: string) {
        // Legacy Invoice: simpler model, no per-line GL mapping.
        // DR Accounts Receivable, CR General Revenue.
        const arAccountCode = '1131';
        const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: arAccountCode } });
        if (!arAccount) throw new Error(`Accounts Receivable account (${arAccountCode}) not found`);

        const revenueAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '4100' } });
        if (!revenueAccount) throw new Error('Revenue account 4100 not found in chart of accounts');

        const journalNumber = `JNL-INV-${invoice.invoiceNumber}`;

        return await prisma.$transaction(async (tx) => {
            // Idempotency: if a journal already exists for this invoice, skip
            const existing = await tx.journalEntry.findFirst({
                where: { reference: invoice.id, referenceType: 'INVOICE' },
            });
            if (existing) {
                return existing;
            }

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: journalNumber,
                    entryDate: invoice.createdAt,
                    postingDate: new Date(),
                    description: `Automated posting for Invoice ${invoice.invoiceNumber}`,
                    reference: invoice.id,
                    referenceType: 'INVOICE',
                    totalDebit: invoice.totalAmount,
                    totalCredit: invoice.totalAmount,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: arAccount.id,
                                debitAmount: invoice.totalAmount,
                                creditAmount: 0,
                                description: `AR - ${invoice.patient ? `${invoice.patient.firstName} ${invoice.patient.lastName}` : 'Patient'}`,
                                invoiceId: invoice.id,
                            },
                            {
                                accountId: revenueAccount.id,
                                debitAmount: 0,
                                creditAmount: invoice.totalAmount,
                                description: `Revenue from ${invoice.invoiceNumber}`,
                                invoiceId: invoice.id,
                            },
                        ],
                    },
                },
            });

            return journal;
        });
    }

    /**
     * Posts a payment receipt to the general ledger.
     *
     * Two posting paths:
     *   A) The invoice was ALREADY journalized (Dr AR / Cr Revenue on invoice creation).
     *      → Payment settles the receivable: Dr Cash / Cr AR (1131/1132)
     *   B) The invoice was NOT journalized (e.g. auto-generated pharmacy/consultation
     *      invoices that don't go through postInvoiceToLedger).
     *      → This is effectively a cash sale at point-of-payment:
     *        Dr Cash / Cr Revenue (control 4100, or per-line if invoice items exist)
     *
     * Without this distinction, every payment would credit AR — but for cash sales
     * AR was never debited, so the credit would leave AR with an unexplained
     * negative balance and Revenue would never be recognized.
     */
    static async postPaymentToLedger(paymentId: string, userId: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                invoice: { include: { items: true } },
                taxInvoice: { include: { lines: true } }
            }
        });

        if (!payment) throw new Error('Payment not found');

        // 1. Determine debit account (Cash at Hand for cash, Bank for everything else)
        const cashAccountCode = payment.paymentMethod === 'Cash' || payment.paymentMethod === 'Cash (UGX)' ? '1110' : '1120';
        const cashAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: cashAccountCode } });
        if (!cashAccount) throw new Error(`Cash/Bank account (${cashAccountCode}) not found`);

        // 2. Was the invoice previously journalized?
        //    Look for any journal with reference = invoiceId and referenceType = INVOICE
        //    (covers both legacy Invoice and TaxInvoice flows).
        const invoiceId = payment.invoiceId || payment.taxInvoiceId;
        let invoiceJournal: { id: string } | null = null;
        if (invoiceId) {
            invoiceJournal = await prisma.journalEntry.findFirst({
                where: { reference: invoiceId, referenceType: 'INVOICE' },
                select: { id: true },
            });
        }

        const invoiceNumber = payment.taxInvoice?.invoiceNumber || payment.invoice?.invoiceNumber || 'Invoice';
        const descriptionVerb = invoiceJournal ? 'settles receivable for' : 'received for';

        // 3. Pick the credit account(s)
        //    Path A (settles AR): single line crediting AR
        //    Path B (cash sale, no prior journal): one or more lines crediting revenue
        let creditLines: Array<{ accountId: string; creditAmount: number; description: string }>;

        if (invoiceJournal) {
            // Path A: Dr Cash / Cr AR
            const arAccountCode = '1131';
            const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: arAccountCode } });
            if (!arAccount) throw new Error(`AR account (${arAccountCode}) not found`);
            creditLines = [{
                accountId: arAccount.id,
                creditAmount: payment.amount,
                description: `AR settlement - ${invoiceNumber}`,
            }];
        } else {
            // Path B: Dr Cash / Cr Revenue (per line item if available, else 4100 control)
            const lines: Array<{ accountId: string; creditAmount: number; description: string }> = [];

            // Prefer legacy invoice items (richer breakdown)
            const invoiceItems = payment.invoice?.items ?? [];
            // Then tax-invoice lines
            const taxLines = payment.taxInvoice?.lines ?? [];
            const sourceItems = invoiceItems.length > 0
                ? invoiceItems.map((i: any) => ({ amount: Math.abs(i.totalPrice ?? 0), itemType: i.itemType, description: i.description }))
                : taxLines.map((l: any) => ({ amount: Math.abs(l.lineTotal ?? 0), itemType: l.itemType, description: l.description }));

            if (sourceItems.length > 0) {
                // Distribute across leaf revenue accounts by itemType
                for (const item of sourceItems) {
                    if (!item.amount) continue;
                    const code = this.itemTypeToRevenueCode(item.itemType);
                    const fallback = await prisma.chartOfAccount.findUnique({ where: { accountCode: '4100' } });
                    const acct = code ? await prisma.chartOfAccount.findUnique({ where: { accountCode: code } }) : null;
                    const target = acct ?? fallback;
                    if (!target) throw new Error('Revenue account 4100 not found in chart of accounts');
                    lines.push({
                        accountId: target.id,
                        creditAmount: item.amount,
                        description: `${item.description || 'Sale'} (${invoiceNumber})`,
                    });
                }
            }

            if (lines.length === 0) {
                // No breakdown available — credit the 4100 control for the full payment
                const fallback = await prisma.chartOfAccount.findUnique({ where: { accountCode: '4100' } });
                if (!fallback) throw new Error('Revenue account 4100 not found in chart of accounts');
                lines.push({
                    accountId: fallback.id,
                    creditAmount: payment.amount,
                    description: `Cash sale - ${invoiceNumber}`,
                });
            }

            creditLines = lines;
        }

        return await prisma.$transaction(async (tx) => {
            // Idempotency: if a journal already exists for this payment, skip
            const existing = await tx.journalEntry.findFirst({
                where: { reference: payment.id, referenceType: 'PAYMENT' },
            });
            if (existing) {
                return existing;
            }

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: `JNL-PAY-${payment.id.slice(-8)}`,
                    entryDate: payment.createdAt,
                    postingDate: new Date(),
                    description: `Payment ${descriptionVerb} ${invoiceNumber}`,
                    reference: payment.id,
                    referenceType: 'PAYMENT',
                    totalDebit: payment.amount,
                    totalCredit: payment.amount,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: cashAccount.id,
                                debitAmount: payment.amount,
                                creditAmount: 0,
                                description: `Payment via ${payment.paymentMethod}`,
                                paymentId: payment.id,
                            },
                            ...creditLines.map(cl => ({
                                accountId: cl.accountId,
                                debitAmount: 0,
                                creditAmount: cl.creditAmount,
                                description: cl.description,
                                paymentId: payment.id,
                            })),
                        ]
                    }
                }
            });

            // Link payment to journal
            await tx.payment.update({
                where: { id: payment.id },
                data: { journalEntryId: journal.id }
            });

            return journal;
        });
    }

    /**
     * Posts a GoodsReceipt (drug procurement) to the general ledger.
     * Debit: Inventory - Drugs & Supplies (1140)  — asset increases as we own the stock
     * Credit: Drug Suppliers Payable (2111)        — liability to the supplier
     *        OR Cash at Hand (1110) / Bank (1120)   — if paid upfront (paymentMethod supplied)
     *
     * The Dr amount = sum(lineTotal) of all goods-receipt items, which is also
     * (purchasePrice × quantityReceived) for each DrugBatch.
     */
    static async postGoodsReceiptToLedger(goodsReceiptId: string, userId: string, paymentMethod?: 'Cash' | 'Bank' | 'Credit') {
        const receipt = await prisma.goodsReceipt.findUnique({
            where: { id: goodsReceiptId },
            include: { items: { include: { drug: { select: { name: true } } } } },
        });
        if (!receipt) throw new Error('GoodsReceipt not found');

        // Compute the inventory value (sum of all line items)
        const totalValue = receipt.items.reduce((s, it) => s + (it.lineTotal || 0), 0);
        if (totalValue <= 0) {
            console.log(`GoodsReceipt ${receipt.grNumber} has zero value — skipping ledger post`);
            return null;
        }

        // 1. Determine accounts
        const inventoryAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '1140' } });
        if (!inventoryAccount) throw new Error('Inventory account (1140) not found');

        let creditAccountCode: string;
        let creditDescription: string;
        if (paymentMethod === 'Cash' || paymentMethod === 'Cash (UGX)') {
            creditAccountCode = '1110';
            creditDescription = `Cash paid for drug procurement — ${receipt.grNumber}`;
        } else if (paymentMethod === 'Bank' || paymentMethod === 'Mobile_Money') {
            creditAccountCode = '1120';
            creditDescription = `Bank paid for drug procurement — ${receipt.grNumber}`;
        } else {
            // Default: credit to supplier (we owe them)
            creditAccountCode = '2111';
            creditDescription = `Drug supplier credit — ${receipt.grNumber}`;
        }
        const creditAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: creditAccountCode } });
        if (!creditAccount) throw new Error(`Credit account (${creditAccountCode}) not found`);

        return await prisma.$transaction(async (tx) => {
            // Idempotency: skip if a journal already exists for this goods receipt
            const existing = await tx.journalEntry.findFirst({
                where: { reference: receipt.id, referenceType: 'INVOICE' },
            });
            if (existing) {
                return existing;
            }

            // Build line description with drug list (truncate if many)
            const drugNames = receipt.items.map(it => it.drug.name);
            const drugList = drugNames.length <= 5
                ? drugNames.join(', ')
                : `${drugNames.slice(0, 5).join(', ')} +${drugNames.length - 5} more`;
            const inventoryDescription = `Inventory received from ${receipt.invoiceNumber || receipt.deliveryNote || 'supplier'} — ${receipt.grNumber} (${drugList})`;

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: `JNL-GR-${receipt.grNumber}`,
                    entryDate: receipt.receivedDate,
                    postingDate: receipt.receivedDate,
                    description: `Drug procurement — ${receipt.grNumber} (${receipt.items.length} item${receipt.items.length === 1 ? '' : 's'})`,
                    reference: receipt.id,
                    referenceType: 'INVOICE',
                    totalDebit: totalValue,
                    totalCredit: totalValue,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: inventoryAccount.id,
                                debitAmount: totalValue,
                                creditAmount: 0,
                                description: inventoryDescription,
                            },
                            {
                                accountId: creditAccount.id,
                                debitAmount: 0,
                                creditAmount: totalValue,
                                description: creditDescription,
                            },
                        ],
                    },
                },
            });

            // Link the goods receipt to the journal
            await tx.goodsReceipt.update({
                where: { id: receipt.id },
                data: { journalEntryId: journal.id },
            });

            return journal;
        });
    }

    /**
     * Posts drug dispensing to the general ledger (COGS).
     * Debit: Cost of Drugs Dispensed (5110)
     * Credit: Inventory - Drugs & Supplies (1140)
     */
    static async postDispenseToLedger(dispenseLogId: string, userId: string) {
        const dispense = await prisma.dispensingLog.findUnique({
            where: { id: dispenseLogId },
            include: { 
                drug: true,
                drugBatch: true
            }
        });

        if (!dispense) throw new Error('Dispensing log not found');

        // 1. Determine accounts
        const cogsAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '5110' } });
        const inventoryAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '1140' } });

        if (!cogsAccount || !inventoryAccount) throw new Error('Finance accounts (COGS/Inventory) not configured');

        // Calculate COGS based on the purchase price of the specific batch used
        const cost = (dispense.drugBatch.purchasePrice || 0) * dispense.quantityDispensed;

        return await prisma.$transaction(async (tx) => {
            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: `JNL-COGS-${dispense.id.slice(-8)}`,
                    entryDate: dispense.createdAt,
                    postingDate: new Date(),
                    description: `COGS for ${dispense.drug.name} (Qty: ${dispense.quantityDispensed}, Batch: ${dispense.drugBatch.batchNumber})`,
                    reference: dispense.id,
                    referenceType: 'EXPENSE',
                    totalDebit: cost,
                    totalCredit: cost,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: cogsAccount.id,
                                debitAmount: cost,
                                creditAmount: 0,
                                description: `Cost of Drugs Dispensed - ${dispense.drug.name}`
                            },
                            {
                                accountId: inventoryAccount.id,
                                debitAmount: 0,
                                creditAmount: cost,
                                description: `Inventory reduction - ${dispense.drug.name}`
                            }
                        ]
                    }
                }
            });

            return journal;
        });
    }

    /**
     * Posts a manual operating expense to the general ledger.
     * Debit: Operating Expense (e.g., 6xxx or 5xxx)
     * Credit: Bank/Cash (1120/1110)
     */
    static async postExpenseToLedger(expenseId: string, userId: string) {
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId }
        });

        if (!expense) throw new Error('Expense not found');

        // 1. Determine Cash/Bank account
        const isCash = !expense.paymentMethod || expense.paymentMethod.toLowerCase().includes('cash');
        const cashAccountCode = isCash ? '1110' : '1120';
        const cashAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: cashAccountCode } });

        // 2. Determine Expense account based on standard chart (fallback to the first available expense account)
        let expenseAccount = await prisma.chartOfAccount.findFirst({
            where: { accountType: 'EXPENSE', accountName: { contains: expense.category, mode: 'insensitive' } }
        });

        if (!expenseAccount) {
            expenseAccount = await prisma.chartOfAccount.findFirst({
                where: { accountType: 'EXPENSE', isControlAccount: false },
                orderBy: { accountCode: 'asc' }
            });
        }

        if (!cashAccount || !expenseAccount) {
             throw new Error('Finance accounts (Cash/Expense) not fully configured');
        }

        return await prisma.$transaction(async (tx) => {
            // Idempotency
            const existing = await tx.journalEntry.findFirst({
                where: {
                    lines: { some: { expenseId: expense.id } },
                },
            });
            if (existing) return existing;

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: `JNL-EXP-${expense.id.slice(-8)}`,
                    entryDate: expense.date,
                    postingDate: new Date(),
                    description: `Operating Expense: ${expense.category} - ${expense.description}`,
                    reference: expense.id,
                    referenceType: 'EXPENSE',
                    totalDebit: expense.amount,
                    totalCredit: expense.amount,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: expenseAccount!.id,
                                debitAmount: expense.amount,
                                creditAmount: 0,
                                description: `Expense - ${expense.description}`,
                                expenseId: expense.id
                            },
                            {
                                accountId: cashAccount.id,
                                debitAmount: 0,
                                creditAmount: expense.amount,
                                description: `Payment for ${expense.category}`,
                                expenseId: expense.id
                            }
                        ]
                    }
                }
            });

            return journal;
        });
    }
}
