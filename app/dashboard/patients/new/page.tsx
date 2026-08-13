"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import styles from "./page.module.css";

interface PatientFormValues {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    bloodGroup?: string;
    phone: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRel?: string;
    email?: string;
    address?: string;
    allergies?: string;
    chronicConditions?: string;
    nextOfKinName?: string;
    nextOfKinPhone?: string;
    nextOfKinEmail?: string;
    nextOfKinAddress?: string;
    nextOfKinRel?: string;
}

export default function NewPatientPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<PatientFormValues>({
        defaultValues: {
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            gender: "MALE",
            phone: "",
        },
    });

    const onSubmit = async (data: PatientFormValues) => {
        setIsSubmitting(true);
        setServerError("");
        try {
            // Build the patient payload
            const submitData: Record<string, unknown> = {
                firstName: data.firstName,
                lastName: data.lastName,
                dateOfBirth: data.dateOfBirth
                    ? new Date(data.dateOfBirth).toISOString()
                    : undefined,
                gender: data.gender,
                bloodGroup: data.bloodGroup || undefined,
                phone: data.phone,
                emergencyContactName: data.emergencyContactName || undefined,
                emergencyContactPhone: data.emergencyContactPhone || undefined,
                emergencyContactRel: data.emergencyContactRel || undefined,
                email: data.email || undefined,
                address: data.address || undefined,
                allergies: data.allergies || undefined,
                chronicConditions: data.chronicConditions || undefined,
                nextOfKinName: data.nextOfKinName || undefined,
                nextOfKinPhone: data.nextOfKinPhone || undefined,
                nextOfKinEmail: data.nextOfKinEmail || undefined,
                nextOfKinAddress: data.nextOfKinAddress || undefined,
                nextOfKinRel: data.nextOfKinRel || undefined,
            };

            const res = await fetch("/api/patients", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submitData),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const errObj = errorData?.error;
                let errorMessage: string;
                if (typeof errObj === "string") {
                    errorMessage = errObj;
                } else if (errObj?.message) {
                    errorMessage = errObj.message;
                } else {
                    errorMessage = "Failed to register patient";
                }
                if (errObj?.details) {
                    const detailStr = typeof errObj.details === "string"
                        ? errObj.details
                        : JSON.stringify(errObj.details);
                    errorMessage = `${errorMessage}: ${detailStr}`;
                }
                throw new Error(errorMessage);
            }

            router.push("/dashboard/patients");
            router.refresh();
        } catch (err: any) {
            setServerError(err.message || "Failed to register patient");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href="/dashboard/patients" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Directory
                </Link>
                <h1 className={styles.title}>Register New Patient</h1>
                <p className={styles.subtitle}>All patients are cash-only (insurance module removed 2026-08).</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.formCard}>
                {serverError && (
                    <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger-color)", borderRadius: "var(--radius-md)", marginBottom: "1.5rem" }}>
                        {serverError}
                    </div>
                )}

                {/* Personal Information */}
                <h2 className={styles.sectionTitle}>Personal Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>First Name *</label>
                        <input {...register("firstName", { required: "First name is required" })} className={styles.input} placeholder="Jane" />
                        {errors.firstName && <span className={styles.errorText}>{errors.firstName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Last Name *</label>
                        <input {...register("lastName", { required: "Last name is required" })} className={styles.input} placeholder="Doe" />
                        {errors.lastName && <span className={styles.errorText}>{errors.lastName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Date of Birth *</label>
                        <input {...register("dateOfBirth", { required: "Date of birth is required" })} type="date" className={styles.input} />
                        {errors.dateOfBirth && <span className={styles.errorText}>{errors.dateOfBirth.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Gender *</label>
                        <select {...register("gender", { required: "Gender is required" })} className={styles.select}>
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
                            <option value="">Unknown</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                        </select>
                    </div>
                </div>

                {/* Contact Information */}
                <h2 className={styles.sectionTitle}>Contact Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Phone Number *</label>
                        <input {...register("phone", { required: "Phone number is required" })} className={styles.input} placeholder="+256 700 000000" />
                        {errors.phone && <span className={styles.errorText}>{errors.phone.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Emergency Contact Name</label>
                        <input {...register("emergencyContactName")} className={styles.input} placeholder="Guardian Name" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Emergency Contact Phone</label>
                        <input {...register("emergencyContactPhone")} className={styles.input} placeholder="+256..." />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Emergency Relation</label>
                        <input {...register("emergencyContactRel")} className={styles.input} placeholder="Father, Mother, etc." />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email Address (Optional)</label>
                        <input {...register("email")} type="email" className={styles.input} placeholder="jane@example.com" />
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Physical Address</label>
                        <input {...register("address")} className={styles.input} placeholder="Street name, Neighborhood" />
                    </div>
                </div>

                {/* Medical Information */}
                <h2 className={styles.sectionTitle}>Medical</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Allergies</label>
                        <textarea {...register("allergies")} className={styles.textarea} placeholder="List any known allergies..." />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Chronic Conditions</label>
                        <textarea {...register("chronicConditions")} className={styles.textarea} placeholder="Asthma, Diabetes, etc..." />
                    </div>
                </div>

                {/* Next of Kin Information */}
                <h2 className={styles.sectionTitle}>Next of Kin Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name of Next of Kin</label>
                        <input {...register("nextOfKinName")} className={styles.input} placeholder="John Kin" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Telephone Contact</label>
                        <input {...register("nextOfKinPhone")} className={styles.input} placeholder="0700000000" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email</label>
                        <input {...register("nextOfKinEmail")} type="email" className={styles.input} placeholder="kin@example.com" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Address</label>
                        <input {...register("nextOfKinAddress")} className={styles.input} placeholder="Village, City, District" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Relationship to Patient</label>
                        <select {...register("nextOfKinRel")} className={styles.select}>
                            <option value="">Select Relationship</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Parent">Parent</option>
                            <option value="Child">Child</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                        <Save size={18} />
                        {isSubmitting ? "Registering…" : "Register Patient"}
                    </button>
                </div>
            </form>
        </div>
    );
}
