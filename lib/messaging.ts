/**
 * Messaging — outbound notifications via Email.
 *
 * The old SMS implementation has been replaced by a proper email client
 * (see `lib/email-client.ts` and `lib/email-receiver.ts`). Every outbound
 * notification (appointment reminders, claim submissions, lab results,
 * internal alerts) is now an email sent through the configured
 * EmailAccount(s) for the tenant.
 *
 * Old SMS-specific functions (sendSMS, sendAppointmentReminder via phone)
 * have been removed; callers should use `sendEmail()` or one of the
 * purpose-built helpers below.
 */
import nodemailer from "nodemailer";
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import ModernInvoicePDF from "../components/finance/ModernInvoicePDF";
import { prisma } from "@/lib/prisma";
import { getMany, getSetting, getTenant } from "./settings/store";
import { sendEmail } from "./email-client";

/** Re-export the email client for convenience. */
export { sendEmail } from "./email-client";
export { syncAccountInbox, syncAllInboxes } from "./email-receiver";

// ───── Insurance claim email ───────────────────────────────────────────────

interface ClaimEmailOptions {
    claimId: string;
    to: string;
    insuranceName: string;
    claimData: any;
}

/**
 * Sends an Insurance Claim email with the premium PDF attached.
 */
export async function sendInsuranceClaimEmail({ claimId, to, insuranceName, claimData }: ClaimEmailOptions) {
    const settings = await getMany([
        'clinicName', 'clinicAddress', 'clinicPhone', 'clinicLogoUrl', 'clinicTerms'
    ]);

    // Construct the PDF
    const pdfBuffer = await renderToBuffer(
        React.createElement(ModernInvoicePDF, {
            clinicInfo: {
                name: settings.clinicName || "VitalCore Healthcare",
                address: settings.clinicAddress || "",
                phone: settings.clinicPhone || "",
                logoUrl: settings.clinicLogoUrl || undefined,
                terms: settings.clinicTerms || undefined
            },
            invoice: {
                invoiceNumber: claimData.invoice?.invoiceNumber || "N/A",
                createdAt: claimData.invoice?.createdAt || new Date(),
                totalAmount: claimData.invoice?.totalAmount || 0,
                balanceDue: claimData.invoice?.balanceDue || 0,
                items: claimData.invoice?.items?.map((i: any) => ({
                    description: i.description,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    totalPrice: i.totalPrice
                })) || []
            },
            patient: {
                firstName: claimData.patient?.firstName || "Patient",
                lastName: claimData.patient?.lastName || "",
                patientNumber: claimData.patient?.patientNumber || "N/A"
            },
            visit: claimData.visit ? {
                visitNumber: claimData.visit.visitNumber,
                date: claimData.visit.createdAt,
                chiefComplaint: claimData.visit.chiefComplaint
            } : undefined,
            authorizations: claimData.authorizations || []
        } as any) as any
    );

    const subjectPrefix = (await getSetting<string>('comm.emailSubjectPrefix', '')) || '';
    const subject = `${subjectPrefix}Insurance Claim: ${claimData.claimNumber} - ${claimData.patient?.firstName} ${claimData.patient?.lastName}`.trim();
    const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #0047AB;">Insurance Claim Submission</h2>
            <p>Hello <strong>${insuranceName}</strong> Team,</p>
            <p>Please find the attached insurance claim for <strong>${claimData.patient?.firstName} ${claimData.patient?.lastName}</strong> regarding their visit on ${new Date(claimData.claimDate).toLocaleDateString()}.</p>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Claim #:</strong> ${claimData.claimNumber}</p>
                <p style="margin: 5px 0;"><strong>Total Amount:</strong> UGX ${claimData.totalAmount?.toLocaleString()}</p>
            </div>
            <p>We have included the detailed invoice and relevant patient information in the attached PDF. We look forward to your feedback and payment processing.</p>
            <p>Regards,<br/><strong>Billing Department</strong><br/>${settings.clinicName || 'VitalCore Healthcare'}</p>
        </div>
    `;

    // Try to find a claim-specific account first
    const claimAccount = await prisma.emailAccount.findFirst({
        where: { purpose: "CLAIMS", isActive: true },
    });

    const result = await sendEmail({
        accountId: claimAccount?.id,
        to,
        subject,
        html,
        claimId: claimId,
        patientId: claimData.patient?.id,
        attachments: [
            {
                filename: `Claim_${claimData.claimNumber}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
            },
        ],
    });

    // Create a notification record
    await prisma.notification.create({
        data: {
            patientId: claimData.patient?.id || "",
            message: `Claim ${claimData.claimNumber} submitted to ${insuranceName}`,
            type: "EMAIL",
            channel: "Email",
            status: result.success ? "Sent" : "Failed",
            reference: result.emailMessageId,
            error: result.error,
        },
    }).catch(() => {}); // patientId may be missing in some flows

    return result;
}

// ───── Appointment reminder ──────────────────────────────────────────────

/**
 * Send an appointment reminder via email to the patient.
 */
export async function sendAppointmentReminder(patientId: string, patientEmail: string, patientName: string, date: string, time: string) {
    const tenant = await getTenant();
    const clinicName = tenant?.name || "VitalCore";
    const subject = `Appointment reminder — ${date} at ${time}`;
    const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0047AB;">${clinicName} — Appointment Reminder</h2>
            <p>Hello <strong>${patientName}</strong>,</p>
            <p>This is a friendly reminder of your upcoming appointment at <strong>${clinicName}</strong>:</p>
            <table style="background: #f9f9f9; padding: 15px; border-radius: 5px; width: 100%; margin: 20px 0;">
                <tr><td><strong>Date:</strong></td><td>${date}</td></tr>
                <tr><td><strong>Time:</strong></td><td>${time}</td></tr>
            </table>
            <p>If you need to reschedule, please contact us as soon as possible.</p>
            <p>Regards,<br/><strong>${clinicName}</strong></p>
        </div>
    `;

    const account = await prisma.emailAccount.findFirst({
        where: { purpose: "NOTIFICATIONS", isActive: true },
    });

    const result = await sendEmail({
        accountId: account?.id,
        to: patientEmail,
        subject,
        html,
        patientId,
        appointmentId: undefined, // link if known
    });

    await prisma.notification.create({
        data: {
            patientId,
            message: `Appointment reminder sent for ${date} ${time}`,
            type: "EMAIL",
            channel: "Email",
            status: result.success ? "Sent" : "Failed",
            reference: result.emailMessageId,
            error: result.error,
        },
    });

    return result;
}
