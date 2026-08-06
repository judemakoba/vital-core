"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Shield, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "./page.module.css";
import { useEffect } from "react";

/**
 * R48: The patient creation form no longer asks "does this patient have
 * insurance?" with a simple yes/no + provider dropdown. Instead, the
 * optional "Insurance Enrollment" section below captures the full
 * enrollment record (provider, member #, policy #, coverage dates) and
 * the API creates the PatientInsurance row in the same transaction.
 *
 * The patient profile no longer has an insurance section (it's
 * insurance-agnostic now). Insurance validation happens on the visit
 * creation form per visit.
 */
const patientSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    dateOfBirth: z.string().min(1, "Date of birth is required"),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { errorMap: () => ({ message: "Please select a valid gender" }) }),
    phone: z.string().min(10, "Valid phone number is required").max(20),
    alternativePhone: z.string().max(20).optional().or(z.literal('')).default(""),
    email: z.string().email("Invalid email").or(z.literal('')).default(""),
    address: z.string().max(500).optional().or(z.literal('')).default(""),
    city: z.string().max(100).optional().or(z.literal('')).default(""),
    district: z.string().max(100).optional().or(z.literal('')).default(""),
    emergencyContactName: z.string().max(100).optional().or(z.literal('')).default(""),
    emergencyContactPhone: z.string().max(20).optional().or(z.literal('')).default(""),
    emergencyContactRel: z.string().max(50).optional().or(z.literal('')).default(""),
    nextOfKinName: z.string().max(100).optional().or(z.literal('')).default(""),
    nextOfKinPhone: z.string().max(20).optional().or(z.literal('')).default(""),
    nextOfKinEmail: z.string().email("Invalid email").or(z.literal('')).default(""),
    nextOfKinAddress: z.string().max(500).optional().or(z.literal('')).default(""),
    nextOfKinRel: z.string().max(50).optional().or(z.literal('')).default(""),
    allergies: z.string().max(1000).optional().or(z.literal('')).default(""),
    chronicConditions: z.string().max(1000).optional().or(z.literal('')).default(""),
    currentMedications: z.string().max(1000).optional().or(z.literal('')).default(""),
    bloodGroup: z.string().max(10).optional().or(z.literal('')).default(""),
    maritalStatus: z.string().max(50).optional().or(z.literal('')).default(""),
    occupation: z.string().max(100).optional().or(z.literal('')).default(""),
    // R48: optional insurance enrollment — captured in a separate
    // section below. If the user toggles "Enroll in insurance", these
    // fields become required.
    enrollInInsurance: z.boolean().default(false),
    enrollmentInsuranceId: z.string().optional().or(z.literal('')).default(""),
    enrollmentMemberNumber: z.string().max(50).optional().or(z.literal('')).default(""),
    enrollmentPolicyNumber: z.string().max(50).optional().or(z.literal('')).default(""),
    enrollmentCoverageStart: z.string().optional().or(z.literal('')).default(""),
    enrollmentCoverageEnd: z.string().optional().or(z.literal('')).default(""),
}).refine(
    (data) => !data.enrollInInsurance || !!data.enrollmentInsuranceId,
    { message: "Insurance provider is required when enrolling", path: ["enrollmentInsuranceId"] }
).refine(
    (data) => !data.enrollInInsurance || !!data.enrollmentPolicyNumber,
    { message: "Policy number is required when enrolling", path: ["enrollmentPolicyNumber"] }
).refine(
    (data) => !data.enrollInInsurance || !!data.enrollmentCoverageStart,
    { message: "Coverage start date is required when enrolling", path: ["enrollmentCoverageStart"] }
);

type PatientFormValues = z.infer<typeof patientSchema>;

export default function NewPatientPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");
    const [insuranceCompanies, setInsuranceCompanies] = useState<any[]>([]);
    // R49: feature flag — when OFF, hide the Insurance Enrollment
    // section entirely. Default true so the form works for clinics
    // that haven't touched the toggle.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<PatientFormValues>({
        resolver: zodResolver(patientSchema) as any,
        defaultValues: {
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            gender: "MALE",
            phone: "",
            alternativePhone: "",
            email: "",
            address: "",
            city: "",
            district: "",
            emergencyContactName: "",
            emergencyContactPhone: "",
            emergencyContactRel: "",
            nextOfKinName: "",
            nextOfKinPhone: "",
            nextOfKinEmail: "",
            nextOfKinAddress: "",
            nextOfKinRel: "",
            allergies: "",
            chronicConditions: "",
            currentMedications: "",
            bloodGroup: "",
            maritalStatus: "",
            occupation: "",
            enrollInInsurance: false,
            enrollmentInsuranceId: "",
            enrollmentMemberNumber: "",
            enrollmentPolicyNumber: "",
            enrollmentCoverageStart: "",
            enrollmentCoverageEnd: "",
        }
    });

    const enrollInInsurance = watch("enrollInInsurance");

    useEffect(() => {
        // R49: feature flag + insurance companies list (only when enabled)
        fetch("/api/insurance/enabled", { credentials: "include" })
            .then(res => res.json())
            .then(data => setInsuranceEnabled(data.enabled !== false))
            .catch(() => setInsuranceEnabled(true));
        fetch("/api/admin/insurance", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setInsuranceCompanies(data.filter((c: any) => c.isActive !== false));
                } else {
                    console.error("Received non-array insurance data:", data);
                    setInsuranceCompanies([]);
                }
            })
            .catch(err => console.error("Failed to fetch insurance companies", err));
    }, []);

    const onSubmit = async (data: PatientFormValues) => {
        setIsSubmitting(true);
        setServerError("");

        try {
            // Build the patient payload (just personal info — R48)
            const submitData: any = {
                firstName: data.firstName,
                lastName: data.lastName,
                dateOfBirth: data.dateOfBirth
                    ? new Date(data.dateOfBirth).toISOString()
                    : undefined,
                gender: data.gender,
                phone: data.phone,
                alternativePhone: data.alternativePhone || undefined,
                email: data.email || undefined,
                address: data.address || undefined,
                city: data.city || undefined,
                district: data.district || undefined,
                emergencyContactName: data.emergencyContactName || undefined,
                emergencyContactPhone: data.emergencyContactPhone || undefined,
                emergencyContactRel: data.emergencyContactRel || undefined,
                nextOfKinName: data.nextOfKinName || undefined,
                nextOfKinPhone: data.nextOfKinPhone || undefined,
                nextOfKinEmail: data.nextOfKinEmail || undefined,
                nextOfKinAddress: data.nextOfKinAddress || undefined,
                nextOfKinRel: data.nextOfKinRel || undefined,
                allergies: data.allergies || undefined,
                chronicConditions: data.chronicConditions || undefined,
                currentMedications: data.currentMedications || undefined,
                bloodGroup: data.bloodGroup || undefined,
                maritalStatus: data.maritalStatus || undefined,
                occupation: data.occupation || undefined,
            };

            // R48: nest the optional insurance enrollment
            if (data.enrollInInsurance && data.enrollmentInsuranceId) {
                submitData.insuranceEnrollment = {
                    insuranceId: data.enrollmentInsuranceId,
                    memberNumber: data.enrollmentMemberNumber || undefined,
                    policyNumber: data.enrollmentPolicyNumber,
                    coverageStart: data.enrollmentCoverageStart,
                    coverageEnd: data.enrollmentCoverageEnd || undefined,
                };
            }

            const res = await fetch("/api/patients", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submitData),
            });

            if (!res.ok) {
                const errorData = await res.json();
                const errObj = errorData?.error;
                let errorMessage: string;
                if (typeof errObj === 'string') {
                    errorMessage = errObj;
                } else if (errObj?.message) {
                    errorMessage = errObj.message;
                } else {
                    errorMessage = "Failed to register patient";
                }
                if (errObj?.details) {
                    const detailStr = typeof errObj.details === 'string'
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
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={`glass-card ${styles.formCard}`}>
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
                        <input {...register("firstName")} className={styles.input} placeholder="Jane" />
                        {errors.firstName && <span className={styles.errorText}>{errors.firstName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Last Name *</label>
                        <input {...register("lastName")} className={styles.input} placeholder="Doe" />
                        {errors.lastName && <span className={styles.errorText}>{errors.lastName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Date of Birth *</label>
                        <input {...register("dateOfBirth")} type="date" className={styles.input} />
                        {errors.dateOfBirth && <span className={styles.errorText}>{errors.dateOfBirth.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Gender *</label>
                        <select {...register("gender")} className={styles.select}>
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
                        <input {...register("phone")} className={styles.input} placeholder="+256 700 000000" />
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

                {/* R48: Insurance Enrollment (optional, captured at patient generation) */}
                {insuranceEnabled && (
                    <>
                <h2 className={styles.sectionTitle}>
                    <Shield size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Insurance Enrollment
                </h2>

                <div className={styles.formGrid}>
                    <div className={styles.formGroupFull}>
                        <label className={styles.checkboxContainer}>
                            <input type="checkbox" {...register("enrollInInsurance")} style={{ width: "16px", height: "16px" }} />
                            Enroll this patient in insurance coverage
                        </label>
                    </div>

                    {enrollInInsurance && (
                        <>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Insurance Provider *</label>
                                <select {...register("enrollmentInsuranceId")} className={styles.select}>
                                    <option value="">Select Provider</option>
                                    {insuranceCompanies.map(comp => (
                                        <option key={comp.id} value={comp.id}>
                                            {comp.name} {comp.consultationFee ? `(Consultation: UGX ${comp.consultationFee.toLocaleString()})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {errors.enrollmentInsuranceId && <span className={styles.errorText}>{errors.enrollmentInsuranceId.message}</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Policy Number *</label>
                                <input
                                    {...register("enrollmentPolicyNumber")}
                                    className={styles.input}
                                    placeholder="e.g. JUB-2025-00432"
                                />
                                {errors.enrollmentPolicyNumber && <span className={styles.errorText}>{errors.enrollmentPolicyNumber.message}</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Member Number</label>
                                <input
                                    {...register("enrollmentMemberNumber")}
                                    className={styles.input}
                                    placeholder="e.g. 001"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Coverage Start *</label>
                                <input
                                    {...register("enrollmentCoverageStart")}
                                    type="date"
                                    className={styles.input}
                                    defaultValue={new Date().toISOString().split('T')[0]}
                                />
                                {errors.enrollmentCoverageStart && <span className={styles.errorText}>{errors.enrollmentCoverageStart.message}</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Coverage End</label>
                                <input
                                    {...register("enrollmentCoverageEnd")}
                                    type="date"
                                    className={styles.input}
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 2 }}>
                                    Optional. Leave blank for open-ended coverage.
                                </small>
                            </div>
                        </>
                    )}
                </div>
                    </>
                )}

                {/* Next of Kin Information */}

                {/* Next of Kin Information */}
                <h2 className={styles.sectionTitle}>Next of Kin Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name of Next of Kin *</label>
                        <input {...register("nextOfKinName")} className={styles.input} placeholder="John Kin" />
                        {errors.nextOfKinName && <span className={styles.errorText}>{errors.nextOfKinName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Telephone Contact (10 Digits) *</label>
                        <input {...register("nextOfKinPhone")} className={styles.input} placeholder="0700000000" />
                        {errors.nextOfKinPhone && <span className={styles.errorText}>{errors.nextOfKinPhone.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email Address (Optional)</label>
                        <input {...register("nextOfKinEmail")} type="email" className={styles.input} placeholder="kin@example.com" />
                        {errors.nextOfKinEmail && <span className={styles.errorText}>{errors.nextOfKinEmail.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Relationship to Patient *</label>
                        <select {...register("nextOfKinRel")} className={styles.select}>
                            <option value="">Select Relationship</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Parent">Parent</option>
                            <option value="Child">Child</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                        </select>
                        {errors.nextOfKinRel && <span className={styles.errorText}>{errors.nextOfKinRel.message}</span>}
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Address *</label>
                        <input {...register("nextOfKinAddress")} className={styles.input} placeholder="Village, City, District" />
                        {errors.nextOfKinAddress && <span className={styles.errorText}>{errors.nextOfKinAddress.message}</span>}
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                        <Save size={18} />
                        {isSubmitting ? "Registering..." : "Register Patient"}
                    </button>
                </div>
            </form>
        </div>
    );
}
