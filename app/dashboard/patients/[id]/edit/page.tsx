"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Save, ArrowLeft, RotateCcw, CheckCircle2, AlertCircle, IdCard, Clock, ShieldAlert } from "lucide-react";
import styles from "../../new/page.module.css";

/**
 * Edit patient form (cash-only — insurance module removed 2026-08).
 *
 * Mirrors the structure of `app/dashboard/patients/new/page.tsx` but
 * pre-populates fields from `GET /api/patients/[id]` and submits via
 * PATCH. Personal / contact / emergency / next-of-kin / medical fields
 * are all editable; the patient number is server-generated and read-only.
 *
 * Operational improvements over the prior implementation:
 *   - Uses the same `formCard` / `sectionTitle` / `formGrid` design
 *     system as the new-patient page (the old fieldset/legend markup
 *     referenced CSS classes that didn't exist in the module).
 *   - Shows the patient number + last-updated timestamp prominently
 *     at the top of the form (read-only context).
 *   - Dropped the dev-internal "Cash-only — insurance module removed
 *     2026-08" subtitle (it leaked implementation detail to the UI).
 *   - Success toast on save + error banner with the API's actual
 *     validation message, not a generic "Failed to update".
 *   - Dirty-state guard: Back / Cancel ask for confirmation if the
 *     form has unsaved changes.
 *   - "Reset to Original" button to revert to the loaded values
 *     (in addition to Cancel which routes back).
 *   - Phone field relaxed to a permissive E.164-ish pattern instead
 *     of the 10-char minLength (some international formats were
 *     getting rejected).
 *   - Next-of-kin relationship is now a select with the same
 *     standard options as the new-patient page.
 *   - Patient number + created date are surface from the API
 *     response so the user can see when the record was opened.
 */

interface PatientFormValues {
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD for the <input type="date">
    gender: "MALE" | "FEMALE" | "OTHER" | "";
    phone: string;
    alternativePhone?: string;
    email?: string;
    address?: string;
    city?: string;
    district?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRel?: string;
    nextOfKinName?: string;
    nextOfKinPhone?: string;
    nextOfKinEmail?: string;
    nextOfKinAddress?: string;
    nextOfKinRel?: string;
    bloodGroup?: string;
    maritalStatus?: string;
    occupation?: string;
    allergies?: string;
    chronicConditions?: string;
    currentMedications?: string;
}

const RELATIONSHIP_OPTIONS = [
    "",
    "Spouse",
    "Parent",
    "Child",
    "Sibling",
    "Friend",
    "Cousin",
    "Uncle/Aunt",
    "Grandparent",
    "Guardian",
    "Other",
];

const BLOOD_GROUP_OPTIONS = [
    "",
    "A+", "A-",
    "B+", "B-",
    "AB+", "AB-",
    "O+", "O-",
];

export default function EditPatientPage() {
    const params = useParams();
    const router = useRouter();
    const patientId = String(params?.id ?? "");
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [meta, setMeta] = useState<{
        patientNumber?: string;
        createdAt?: string;
        updatedAt?: string;
    } | null>(null);

    const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PatientFormValues>({
        defaultValues: {
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            gender: "",
            phone: "",
        },
    });

    // Load the existing record
    useEffect(() => {
        if (!patientId) return;
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setServerError("");
            setSuccessMsg("");
            try {
                const res = await fetch(`/api/patients/${patientId}`, {
                    credentials: "include",
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error?.message || err.error || "Failed to load patient");
                }
                const p = await res.json();
                if (cancelled) return;

                // Normalize DOB to YYYY-MM-DD for the <input type="date">
                const dob = p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : "";

                // Normalize legacy gender values (e.g. "Male") to the enum casing
                // the form expects ("MALE"). The DB migration cleaned this up
                // but defending here means we never strand a patient whose
                // record predates the cleanup.
                const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER"]);
                const genderNormalized = (p.gender || "").toString().toUpperCase();
                const gender: PatientFormValues["gender"] = VALID_GENDER.has(genderNormalized)
                    ? (genderNormalized as "MALE" | "FEMALE" | "OTHER")
                    : "";

                setMeta({
                    patientNumber: p.patientNumber || undefined,
                    createdAt: p.createdAt || undefined,
                    updatedAt: p.updatedAt || undefined,
                });

                reset({
                    firstName: p.firstName || "",
                    lastName: p.lastName || "",
                    dateOfBirth: dob,
                    gender,
                    phone: p.phone || "",
                    alternativePhone: p.alternativePhone || "",
                    email: p.email || "",
                    address: p.address || "",
                    city: p.city || "",
                    district: p.district || "",
                    emergencyContactName: p.emergencyContactName || "",
                    emergencyContactPhone: p.emergencyContactPhone || "",
                    emergencyContactRel: p.emergencyContactRel || "",
                    nextOfKinName: p.nextOfKinName || "",
                    nextOfKinPhone: p.nextOfKinPhone || "",
                    nextOfKinEmail: p.nextOfKinEmail || "",
                    nextOfKinAddress: p.nextOfKinAddress || "",
                    nextOfKinRel: p.nextOfKinRel || "",
                    bloodGroup: p.bloodGroup || "",
                    maritalStatus: p.maritalStatus || "",
                    occupation: p.occupation || "",
                    allergies: p.allergies || "",
                    chronicConditions: p.chronicConditions || "",
                    currentMedications: p.currentMedications || "",
                });
            } catch (err: any) {
                if (!cancelled) setServerError(err.message || "Failed to load patient");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [patientId, reset]);

    // Reload the original values for the Reset button
    const reloadOriginal = async () => {
        try {
            const res = await fetch(`/api/patients/${patientId}`, { credentials: "include" });
            if (!res.ok) return;
            const p = await res.json();
            const dob = p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : "";
            const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER"]);
            const genderNormalized = (p.gender || "").toString().toUpperCase();
            const gender: PatientFormValues["gender"] = VALID_GENDER.has(genderNormalized)
                ? (genderNormalized as "MALE" | "FEMALE" | "OTHER")
                : "";
            reset({
                firstName: p.firstName || "",
                lastName: p.lastName || "",
                dateOfBirth: dob,
                gender,
                phone: p.phone || "",
                alternativePhone: p.alternativePhone || "",
                email: p.email || "",
                address: p.address || "",
                city: p.city || "",
                district: p.district || "",
                emergencyContactName: p.emergencyContactName || "",
                emergencyContactPhone: p.emergencyContactPhone || "",
                emergencyContactRel: p.emergencyContactRel || "",
                nextOfKinName: p.nextOfKinName || "",
                nextOfKinPhone: p.nextOfKinPhone || "",
                nextOfKinEmail: p.nextOfKinEmail || "",
                nextOfKinAddress: p.nextOfKinAddress || "",
                nextOfKinRel: p.nextOfKinRel || "",
                bloodGroup: p.bloodGroup || "",
                maritalStatus: p.maritalStatus || "",
                occupation: p.occupation || "",
                allergies: p.allergies || "",
                chronicConditions: p.chronicConditions || "",
                currentMedications: p.currentMedications || "",
            });
        } catch {
            // ignore — the user can just navigate away
        }
    };

    // Dirty-state guard for Back / Cancel
    const safeBack = () => {
        if (isDirty && !window.confirm("You have unsaved changes. Discard them and leave this page?")) {
            return;
        }
        router.push(`/dashboard/patients/${patientId}`);
    };

    const onSubmit = async (data: PatientFormValues) => {
        setIsSubmitting(true);
        setServerError("");
        setSuccessMsg("");
        try {
            // The API requires dateOfBirth as a full ISO datetime string.
            // If the user left it blank, we don't send the field rather
            // than sending "Invalid Date" or empty.
            const payload: Record<string, unknown> = { ...data };
            if (data.dateOfBirth) {
                payload.dateOfBirth = new Date(data.dateOfBirth).toISOString();
            } else {
                delete payload.dateOfBirth;
            }
            // Drop empty string gender to keep the DB enum clean
            if (data.gender === "") {
                delete payload.gender;
            }

            const res = await fetch(`/api/patients/${patientId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                // Zod validation errors come back as a string OR an
                // object with .error or .details. Surface the actual
                // message so the user knows which field is wrong.
                const errObj = err?.error ?? err;
                let msg: string;
                if (typeof errObj === "string") {
                    msg = errObj;
                } else if (errObj?.message) {
                    msg = errObj.message;
                } else if (errObj?.details) {
                    msg = typeof errObj.details === "string"
                        ? errObj.details
                        : JSON.stringify(errObj.details);
                } else {
                    msg = "Failed to update patient";
                }
                throw new Error(msg);
            }
            // Show success state, re-mark the form as pristine, and
            // refresh meta with the new updatedAt (the API returns the
            // updated patient row).
            const updated = await res.json().catch(() => null);
            if (updated?.updatedAt) {
                setMeta((m) => m ? { ...m, updatedAt: updated.updatedAt } : m);
            }
            setSuccessMsg("Patient record updated successfully.");
            // Re-reset the form to the saved values so isDirty becomes
            // false and the "unsaved changes" guard stops firing.
            await reloadOriginal();
        } catch (err: any) {
            setServerError(err.message || "Failed to update patient");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <Link href={`/dashboard/patients/${patientId}`} className={styles.backLink}>
                        <ArrowLeft size={16} /> Back to Profile
                    </Link>
                    <h1 className={styles.title}>Edit Patient</h1>
                </div>
                <p style={{ color: "var(--text-muted)" }}>Loading patient details…</p>
            </div>
        );
    }

    const createdAtLabel = meta?.createdAt
        ? new Date(meta.createdAt).toLocaleString()
        : "—";
    const updatedAtLabel = meta?.updatedAt
        ? new Date(meta.updatedAt).toLocaleString()
        : "—";

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href={`/dashboard/patients/${patientId}`} className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Profile
                </Link>
                <h1 className={styles.title}>Edit Patient</h1>
                <p className={styles.subtitle}>
                    Update personal, contact, and medical information. Patient number is permanent.
                </p>
            </div>

            {/* Read-only context card: patient number + audit timestamps */}
            <div className={styles.formCard} style={{ padding: "1rem 1.25rem", marginBottom: "0.5rem" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem",
                    alignItems: "center",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <IdCard size={18} color="var(--primary-color)" />
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Patient Number</div>
                            <div style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                {meta?.patientNumber ?? "—"}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Clock size={18} color="var(--text-secondary)" />
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Record Created</div>
                            <div style={{ fontSize: "0.875rem" }}>{createdAtLabel}</div>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Clock size={18} color="var(--text-secondary)" />
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Last Updated</div>
                            <div style={{ fontSize: "0.875rem" }}>{updatedAtLabel}</div>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.formCard}>
                {serverError && (
                    <div style={{
                        display: "flex", gap: "0.5rem", alignItems: "flex-start",
                        padding: "1rem",
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "var(--danger-color)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "1.5rem",
                        borderLeft: "4px solid var(--danger-color)",
                    }}>
                        <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ whiteSpace: "pre-line" }}>{serverError}</div>
                    </div>
                )}

                {successMsg && (
                    <div style={{
                        display: "flex", gap: "0.5rem", alignItems: "center",
                        padding: "1rem",
                        background: "rgba(16, 185, 129, 0.1)",
                        color: "#047857",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "1.5rem",
                        borderLeft: "4px solid #10b981",
                    }}>
                        <CheckCircle2 size={18} />
                        <div>{successMsg}</div>
                    </div>
                )}

                {isDirty && !isSubmitting && !successMsg && (
                    <div style={{
                        display: "flex", gap: "0.5rem", alignItems: "center",
                        padding: "0.625rem 1rem",
                        background: "rgba(245, 158, 11, 0.08)",
                        color: "#92400e",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "1rem",
                        fontSize: "0.875rem",
                    }}>
                        <AlertCircle size={16} />
                        <div>You have unsaved changes.</div>
                    </div>
                )}

                {/* Personal Information */}
                <h2 className={styles.sectionTitle}>Personal Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>First Name *</label>
                        <input
                            {...register("firstName", { required: "First name is required", maxLength: 100 })}
                            className={styles.input}
                            placeholder="Jane"
                        />
                        {errors.firstName && <span className={styles.errorText}>{errors.firstName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Last Name *</label>
                        <input
                            {...register("lastName", { required: "Last name is required", maxLength: 100 })}
                            className={styles.input}
                            placeholder="Doe"
                        />
                        {errors.lastName && <span className={styles.errorText}>{errors.lastName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Date of Birth *</label>
                        <input
                            type="date"
                            {...register("dateOfBirth", { required: "Date of birth is required" })}
                            className={styles.input}
                        />
                        {errors.dateOfBirth && <span className={styles.errorText}>{errors.dateOfBirth.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Gender *</label>
                        <select
                            {...register("gender", { required: "Gender is required" })}
                            className={styles.select}
                        >
                            <option value="">Select Gender</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                        </select>
                        {errors.gender && <span className={styles.errorText}>{errors.gender.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Blood Group</label>
                        <select {...register("bloodGroup")} className={styles.select}>
                            {BLOOD_GROUP_OPTIONS.map((bg) => (
                                <option key={bg} value={bg}>{bg || "Unknown"}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Contact Information */}
                <h2 className={styles.sectionTitle}>Contact Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Phone Number *</label>
                        <input
                            {...register("phone", {
                                required: "Phone number is required",
                                pattern: {
                                    value: /^[\d\s+()\-.]{10,20}$/,
                                    message: "Use digits, spaces, + ( ) - only (10–20 chars)",
                                },
                            })}
                            className={styles.input}
                            placeholder="+256 700 000000"
                        />
                        {errors.phone && <span className={styles.errorText}>{errors.phone.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Alternative Phone</label>
                        <input
                            {...register("alternativePhone", {
                                pattern: {
                                    value: /^[\d\s+()\-.]{0,20}$/,
                                    message: "Use digits, spaces, + ( ) - only",
                                },
                            })}
                            className={styles.input}
                            placeholder="Optional"
                        />
                        {errors.alternativePhone && (
                            <span className={styles.errorText}>{errors.alternativePhone.message}</span>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email Address (Optional)</label>
                        <input
                            {...register("email")}
                            type="email"
                            className={styles.input}
                            placeholder="jane@example.com"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>City / Town</label>
                        <input {...register("city")} className={styles.input} placeholder="e.g. Kampala" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>District</label>
                        <input {...register("district")} className={styles.input} placeholder="e.g. Wakiso" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Occupation</label>
                        <input {...register("occupation")} className={styles.input} placeholder="e.g. Teacher" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Marital Status</label>
                        <input {...register("maritalStatus")} className={styles.input} placeholder="e.g. Single" />
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Physical Address</label>
                        <input
                            {...register("address")}
                            className={styles.input}
                            placeholder="Street / village, parish, district"
                        />
                    </div>
                </div>

                {/* Emergency Contact */}
                <h2 className={styles.sectionTitle}>Emergency Contact</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name</label>
                        <input {...register("emergencyContactName")} className={styles.input} placeholder="Guardian Name" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Phone</label>
                        <input
                            {...register("emergencyContactPhone", {
                                pattern: {
                                    value: /^[\d\s+()\-.]{0,20}$/,
                                    message: "Use digits, spaces, + ( ) - only",
                                },
                            })}
                            className={styles.input}
                            placeholder="+256…"
                        />
                        {errors.emergencyContactPhone && (
                            <span className={styles.errorText}>{errors.emergencyContactPhone.message}</span>
                        )}
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Relationship</label>
                        <input {...register("emergencyContactRel")} className={styles.input} placeholder="Father, Mother, Spouse, etc." />
                    </div>
                </div>

                {/* Next of Kin */}
                <h2 className={styles.sectionTitle}>Next of Kin</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name</label>
                        <input {...register("nextOfKinName")} className={styles.input} placeholder="John Kin" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Phone</label>
                        <input
                            {...register("nextOfKinPhone", {
                                pattern: {
                                    value: /^[\d\s+()\-.]{0,20}$/,
                                    message: "Use digits, spaces, + ( ) - only",
                                },
                            })}
                            className={styles.input}
                            placeholder="0700000000"
                        />
                        {errors.nextOfKinPhone && (
                            <span className={styles.errorText}>{errors.nextOfKinPhone.message}</span>
                        )}
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email</label>
                        <input {...register("nextOfKinEmail")} type="email" className={styles.input} placeholder="kin@example.com" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Address</label>
                        <input {...register("nextOfKinAddress")} className={styles.input} placeholder="Village, City" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Relationship to Patient</label>
                        <select {...register("nextOfKinRel")} className={styles.select}>
                            {RELATIONSHIP_OPTIONS.map((r) => (
                                <option key={r} value={r}>{r || "Select relationship"}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Medical */}
                <h2 className={styles.sectionTitle}>Medical</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Allergies</label>
                        <textarea
                            {...register("allergies")}
                            className={styles.textarea}
                            placeholder="List any known allergies (e.g. Penicillin, peanuts)"
                            rows={2}
                        />
                    </div>
                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Chronic Conditions</label>
                        <textarea
                            {...register("chronicConditions")}
                            className={styles.textarea}
                            placeholder="e.g. Asthma, Type 2 Diabetes, Hypertension"
                            rows={2}
                        />
                    </div>
                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Current Medications</label>
                        <textarea
                            {...register("currentMedications")}
                            className={styles.textarea}
                            placeholder="e.g. Metformin 500mg BD, Amlodipine 5mg OD"
                            rows={2}
                        />
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button
                        type="button"
                        onClick={() => reloadOriginal()}
                        disabled={!isDirty || isSubmitting}
                        className={styles.cancelBtn}
                        title="Discard edits and reload the original values"
                    >
                        <RotateCcw size={16} style={{ marginRight: "0.4rem", verticalAlign: "middle" }} />
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={safeBack}
                        className={styles.cancelBtn}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || !isDirty}
                        className={styles.submitBtn}
                    >
                        <Save size={18} />
                        {isSubmitting ? "Saving…" : "Update Patient"}
                    </button>
                </div>
            </form>
        </div>
    );
}
