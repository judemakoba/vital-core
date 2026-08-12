/**
 * Messaging — outbound notifications via Email.
 *
 * The old SMS implementation has been replaced by a proper email client
 * (see `lib/email-client.ts` and `lib/email-receiver.ts`). Every outbound
 * notification (appointment reminders, lab results, internal alerts) is
 * now an email sent through the configured EmailAccount(s) for the tenant.
 *
 * Old SMS-specific functions (sendSMS, sendAppointmentReminder via phone)
 * have been removed; callers should use `sendEmail()` or one of the
 * purpose-built helpers below.
 *
 * Note: `sendInsuranceClaimEmail` was removed in 2026-08 along with the
 * insurance module. Insurance claim submission is no longer a flow —
 * all patients are cash-only.
 */
import { prisma } from "@/lib/prisma";
import { getTenant } from "./settings/store";
import { sendEmail } from "./email-client";

/** Re-export the email client for convenience. */
export { sendEmail } from "./email-client";
export { syncAccountInbox, syncAllInboxes } from "./email-receiver";

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
