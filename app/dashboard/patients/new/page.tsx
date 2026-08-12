"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { Save, ArrowLeft } from "lucide-react";
import styles from "./page.module.css";

interface PatientFormValues {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
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

export default function NewPatientPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");

    const { register, handleSubmit, formState: { errors } } = useForm<PatientFormValues>({
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
            const res = await fetch("/api/patients", {
                method: "POST",
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
                throw new Error(err.error || err.message || "Failed to register patient");
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
                        {isSubmitting ? "Registering…" : "Register Patient"}
                    </button>
                </div>
            </form>
        </div>
    );
}
