"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Save, ArrowLeft } from "lucide-react";
import styles from "../../new/page.module.css";

/**
 * Edit patient form (cash-only — insurance module removed 2026-08).
 *
 * Mirrors the structure of `app/dashboard/patients/new/page.tsx` but
 * pre-populates fields from `GET /api/patients/[id]` and submits via
 * PATCH. Personal / contact / emergency / next-of-kin / medical fields
 * are all editable; the patient number is NOT (server-generated).
 */
interface PatientFormValues {
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD for the <input type="date">
    gender: "MALE" | "FEMALE" | "OTHER";
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

export default function EditPatientPage() {
    const params = useParams();
    const router = useRouter();
    const patientId = String(params?.id ?? "");
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");

    const { register, handleSubmit, reset, formState: { errors } } = useForm<PatientFormValues>({
        defaultValues: {
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            gender: "MALE",
            phone: "",
        },
    });

    // Load the existing record
    useEffect(() => {
        if (!patientId) return;
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
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

                const dob = p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : "";

                // Normalize legacy gender values (e.g. "Male") to the enum casing
                // the form expects ("MALE"). The DB migration cleaned this up
                // but defending here means we never strand a patient whose
                // record predates the cleanup.
                const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER"]);
                const genderNormalized = (p.gender || "").toString().toUpperCase();
                const gender = VALID_GENDER.has(genderNormalized) ? (genderNormalized as "MALE" | "FEMALE" | "OTHER") : "MALE";

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

    const onSubmit = async (data: PatientFormValues) => {
        setIsSubmitting(true);
        setServerError("");
        try {
            const res = await fetch(`/api/patients/${patientId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...data,
                    dateOfBirth: data.dateOfBirth
                        ? new Date(data.dateOfBirth).toISOString()
                        : undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = typeof err.error === "string" ? err.error : err.error?.message || err.message;
                throw new Error(msg || "Failed to update patient");
            }
            router.push(`/dashboard/patients/${patientId}`);
            router.refresh();
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

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href={`/dashboard/patients/${patientId}`} className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Profile
                </Link>
                <h1 className={styles.title}>Edit Patient</h1>
                <p className={styles.subtitle}>Cash-only — insurance module removed 2026-08.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                {serverError && <div className={styles.serverError}>{serverError}</div>}

                <fieldset className={styles.section}>
                    <legend>Personal info</legend>
                    <div className={styles.grid2}>
                        <div>
                            <label>First name *</label>
                            <input {...register("firstName", { required: "First name is required", maxLength: 100 })} className={styles.input} />
                            {errors.firstName && <span className={styles.errorText}>{errors.firstName.message}</span>}
                        </div>
                        <div>
                            <label>Last name *</label>
                            <input {...register("lastName", { required: "Last name is required", maxLength: 100 })} className={styles.input} />
                            {errors.lastName && <span className={styles.errorText}>{errors.lastName.message}</span>}
                        </div>
                        <div>
                            <label>Date of birth *</label>
                            <input type="date" {...register("dateOfBirth", { required: "DOB is required" })} className={styles.input} />
                            {errors.dateOfBirth && <span className={styles.errorText}>{errors.dateOfBirth.message}</span>}
                        </div>
                        <div>
                            <label>Gender *</label>
                            <select {...register("gender", { required: true })} className={styles.input}>
                                <option value="MALE">Male</option>
                                <option value="FEMALE">Female</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                    </div>
                </fieldset>

                <fieldset className={styles.section}>
                    <legend>Contact</legend>
                    <div className={styles.grid2}>
                        <div>
                            <label>Phone *</label>
                            <input {...register("phone", { required: "Phone is required", minLength: 10, maxLength: 20 })} className={styles.input} placeholder="+256…" />
                            {errors.phone && <span className={styles.errorText}>{errors.phone.message}</span>}
                        </div>
                        <div>
                            <label>Alternative phone</label>
                            <input {...register("alternativePhone")} className={styles.input} />
                        </div>
                        <div>
                            <label>Email</label>
                            <input type="email" {...register("email")} className={styles.input} />
                        </div>
                        <div>
                            <label>City</label>
                            <input {...register("city")} className={styles.input} />
                        </div>
                        <div className={styles.gridFull}>
                            <label>Address</label>
                            <input {...register("address")} className={styles.input} placeholder="Village / cell, parish, district" />
                        </div>
                    </div>
                </fieldset>

                <fieldset className={styles.section}>
                    <legend>Emergency contact</legend>
                    <div className={styles.grid3}>
                        <div>
                            <label>Name</label>
                            <input {...register("emergencyContactName")} className={styles.input} />
                        </div>
                        <div>
                            <label>Phone</label>
                            <input {...register("emergencyContactPhone")} className={styles.input} />
                        </div>
                        <div>
                            <label>Relationship</label>
                            <input {...register("emergencyContactRel")} className={styles.input} />
                        </div>
                    </div>
                </fieldset>

                <fieldset className={styles.section}>
                    <legend>Next of kin</legend>
                    <div className={styles.grid3}>
                        <div>
                            <label>Name</label>
                            <input {...register("nextOfKinName")} className={styles.input} />
                        </div>
                        <div>
                            <label>Phone</label>
                            <input {...register("nextOfKinPhone")} className={styles.input} />
                        </div>
                        <div>
                            <label>Email</label>
                            <input type="email" {...register("nextOfKinEmail")} className={styles.input} />
                        </div>
                        <div>
                            <label>Address</label>
                            <input {...register("nextOfKinAddress")} className={styles.input} />
                        </div>
                        <div>
                            <label>Relationship</label>
                            <input {...register("nextOfKinRel")} className={styles.input} />
                        </div>
                    </div>
                </fieldset>

                <fieldset className={styles.section}>
                    <legend>Medical</legend>
                    <div className={styles.grid3}>
                        <div>
                            <label>Blood group</label>
                            <select {...register("bloodGroup")} className={styles.input}>
                                <option value="">—</option>
                                <option value="A+">A+</option><option value="A-">A-</option>
                                <option value="B+">B+</option><option value="B-">B-</option>
                                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                                <option value="O+">O+</option><option value="O-">O-</option>
                            </select>
                        </div>
                        <div>
                            <label>Marital status</label>
                            <input {...register("maritalStatus")} className={styles.input} />
                        </div>
                        <div>
                            <label>Occupation</label>
                            <input {...register("occupation")} className={styles.input} />
                        </div>
                        <div className={styles.gridFull}>
                            <label>Allergies</label>
                            <textarea {...register("allergies")} className={styles.input} rows={2} />
                        </div>
                        <div className={styles.gridFull}>
                            <label>Chronic conditions</label>
                            <textarea {...register("chronicConditions")} className={styles.input} rows={2} />
                        </div>
                        <div className={styles.gridFull}>
                            <label>Current medications</label>
                            <textarea {...register("currentMedications")} className={styles.input} rows={2} />
                        </div>
                    </div>
                </fieldset>

                <div className={styles.formActions}>
                    <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                        <Save size={18} />
                        {isSubmitting ? "Updating…" : "Update Patient Record"}
                    </button>
                </div>
            </form>
        </div>
    );
}
