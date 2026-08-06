"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "./page.module.css";

const staffSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Valid phone number is required"),
    employeeId: z.string().min(2, "Employee ID is required"),
    department: z.string().min(2, "Department is required"),
    roleId: z.string().min(1, "Role is required"),
    defaultPassword: z.string().min(8, "Password must be at least 8 characters"),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export default function NewStaffPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<StaffFormValues>({
        resolver: zodResolver(staffSchema),
        defaultValues: { defaultPassword: "Password123!" }
    });

    const onSubmit = async (data: StaffFormValues) => {
        setIsSubmitting(true);
        setServerError("");

        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to create user");
            }

            router.push("/dashboard/staff");
            router.refresh();
        } catch (err: any) {
            setServerError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href="/dashboard/staff" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Staff List
                </Link>
                <h1 className={styles.title}>Add New Staff</h1>
            </div>

            <div className={`glass-card ${styles.formCard}`}>
                {serverError && (
                    <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger-color)", borderRadius: "var(--radius-md)", marginBottom: "1.5rem" }}>
                        {serverError}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className={styles.formGrid}>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name</label>
                        <input {...register("name")} className={styles.input} placeholder="John Doe" />
                        {errors.name && <span className={styles.errorText}>{errors.name.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email Address</label>
                        <input {...register("email")} type="email" className={styles.input} placeholder="john@clinic.com" />
                        {errors.email && <span className={styles.errorText}>{errors.email.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Phone Number</label>
                        <input {...register("phone")} className={styles.input} placeholder="+256 700 000000" />
                        {errors.phone && <span className={styles.errorText}>{errors.phone.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Employee ID</label>
                        <input {...register("employeeId")} className={styles.input} placeholder="EMP-001" />
                        {errors.employeeId && <span className={styles.errorText}>{errors.employeeId.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Department</label>
                        <select {...register("department")} className={styles.select}>
                            <option value="">Select Department</option>
                            <option value="Administration">Administration</option>
                            <option value="Clinical">Clinical</option>
                            <option value="Nursing">Nursing</option>
                            <option value="Pharmacy">Pharmacy</option>
                            <option value="Laboratory">Laboratory</option>
                            <option value="Finance">Finance</option>
                        </select>
                        {errors.department && <span className={styles.errorText}>{errors.department.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>System Role</label>
                        <select {...register("roleId")} className={styles.select}>
                            {/* Note: Roles would ideally be fetched from the DB, hardcoded for Phase 1 UI mockup */}
                            <option value="">Select Role</option>
                            <option value="cli9test10000roleadmin">Admin</option>
                            <option value="cli9test20000roledoctor">Doctor</option>
                            <option value="cli9test30000rolenurse">Nurse</option>
                            <option value="cli9test40000rolerecept">Receptionist</option>
                        </select>
                        {errors.roleId && <span className={styles.errorText}>{errors.roleId.message}</span>}
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Default Password</label>
                        <input {...register("defaultPassword")} className={styles.input} readOnly />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                            Share this password securely with the new staff member. They will be prompted to change it on first login.
                        </span>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                            <Save size={18} />
                            {isSubmitting ? "Saving..." : "Save Staff Member"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
