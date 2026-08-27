"use client";

import React from 'react';
import styles from './ModernInvoicePaper.module.css';

interface InvoiceItem {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

interface ModernInvoicePaperProps {
    clinicInfo: {
        name: string;
        address: string;
        phone: string;
        email?: string;
        taxId?: string;
        registrationNumber?: string;
        logoUrl?: string;
        terms?: string;
    };
    invoice: {
        invoiceNumber: string;
        createdAt: string | Date;
        totalAmount: number;
        balanceDue: number;
        items: InvoiceItem[];
        /**
         * Date the invoice was fully paid (most-recent payment that
         * zeroed the balance). When present, the PAID stamp is rendered
         * over the invoice. Pass null/undefined for unpaid invoices.
         */
        paidAt?: string | Date | null;
    };
    patient: {
        firstName: string;
        lastName: string;
        patientNumber: string;
    };
    visit?: {
        visitNumber: string;
        date: string | Date;
        chiefComplaint?: string;
    };
}

const ModernInvoicePaper: React.FC<ModernInvoicePaperProps> = ({
    clinicInfo,
    invoice,
    patient,
    visit
}) => {
    return (
        <div className={styles.paper}>
            {/* PAID stamp — round green ring with the word PAID in green and the
                payment date in red, slightly rotated like a real rubber stamp.
                Only rendered when the invoice is fully paid (paidAt set). The
                print-color-adjust keeps the green/red ink visible in print
                even if the user's browser strips background colors. */}
            {invoice.paidAt && (
                <div className={styles.paidStamp} aria-label="Paid">
                    <div className={styles.paidStampText}>PAID</div>
                    <div className={styles.paidStampDate}>
                        {new Date(invoice.paidAt).toLocaleDateString()}
                    </div>
                </div>
            )}

            {/* Background Waves */}
            <div className={styles.headerBackground}>
                <svg width="100%" height="180" viewBox="0 0 800 180" preserveAspectRatio="none">
                    <path
                        d="M0,0 L800,0 L800,120 C600,180 200,80 0,140 Z"
                        fill="#eef2ff"
                    />
                    <path
                        d="M0,0 L800,0 L800,100 C500,160 300,60 0,120 Z"
                        fill="#e0e7ff"
                    />
                </svg>
            </div>

            <div className={styles.content}>
                {/* Header Section */}
                <div className={styles.logoRow}>
                    <div className={styles.logoContainer}>
                        {clinicInfo.logoUrl ? (
                            <img src={clinicInfo.logoUrl} alt={clinicInfo.name} className={styles.logo} />
                        ) : (
                            <h2 style={{ color: '#0047AB', fontWeight: 800 }}>{clinicInfo.name}</h2>
                        )}
                    </div>
                    <div className={styles.titleSection}>
                        <h1 className={styles.invoiceTitle}>INVOICE</h1>
                        <div className={styles.meta}>
                            <div>Number: <strong>{invoice.invoiceNumber}</strong></div>
                            <div>Date: {new Date(invoice.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                </div>

                {/* Info Grid */}
                <div className={styles.infoGrid}>
                    <div className={styles.clinicInfo}>
                        <span className={styles.infoLabel}>From:</span>
                        <div className={styles.infoValue}>
                            <strong>{clinicInfo.name}</strong>{"\n"}
                            {clinicInfo.address}{"\n"}
                            {clinicInfo.phone && <>Tel: {clinicInfo.phone}{"\n"}</>}
                            {clinicInfo.email && <>{clinicInfo.email}{"\n"}</>}
                            {clinicInfo.taxId && <>TIN: {clinicInfo.taxId}{"\n"}</>}
                            {clinicInfo.registrationNumber && <>Reg: {clinicInfo.registrationNumber}</>}
                        </div>
                    </div>
                    <div className={styles.billingTo}>
                        <span className={styles.infoLabel}>Billing To:</span>
                        <div className={styles.infoValue}>
                            <strong>{patient.firstName} {patient.lastName}</strong>{"\n"}
                            ID: {patient.patientNumber}{"\n"}
                            {visit && `Visit: ${visit.visitNumber}`}
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <table className={styles.itemsTable}>
                    <thead>
                        <tr>
                            <th className={styles.colDesc}>Service Description</th>
                            <th className={styles.colQty}>Qty</th>
                            <th className={styles.colPrice}>Price</th>
                            <th className={styles.colTotal}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, idx) => (
                            <tr key={idx}>
                                <td>{item.description}</td>
                                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right' }}>{item.unitPrice.toLocaleString()}</td>
                                <td style={{ textAlign: 'right' }}>{item.totalPrice.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Summary Details */}
                <div className={styles.summarySection}>
                    <div className={styles.summaryBox}>
                        <div className={styles.summaryRow}>
                            <span className={styles.summaryLabel}>Subtotal:</span>
                            <span className={styles.summaryValue}>UGX {invoice.totalAmount.toLocaleString()}</span>
                        </div>
                        <div className={styles.summaryRow}>
                            <span className={styles.summaryLabel}>Tax (0%):</span>
                            <span className={styles.summaryValue}>UGX 0</span>
                        </div>
                        <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                            <span style={{ fontWeight: 700 }}>TOTAL DUE:</span>
                            <span className={styles.totalValue}>UGX {invoice.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Footer / Terms */}
                <div className={styles.footer}>
                    <div className={styles.footerBrand}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 11h-6V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z" fill="currentColor" />
                        </svg>
                        <span>{clinicInfo.name}</span>
                    </div>
                    <div className={styles.termsTitle}>Terms & Conditions:</div>
                    <div className={styles.termsText}>
                        {clinicInfo.terms}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModernInvoicePaper;
