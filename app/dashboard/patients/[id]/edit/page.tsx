"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "../../new/page.module.css"; // Reuse registration styles

/**
 * R48 edit form. Insurance is captured at patient generation and can
 * be edited here (cashier may need to update the policy #, member #,
 * coverage dates, or switch insurance companies). The enrollment is
 * sent in the same PATCH payload as the patient info.
 */
const patientSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    dateOfBirth: z.string().min(1, "Date of birth is required"),
    gender: z.string().min(1, "Gender is required"),
    phone: z.string().min(10, "Valid phone number is required"),
    email: z.string().email("Invalid email").or(z.literal('')).default(""),
    address: z.string().default(""),
    city: z.string().default(""),
    emergencyContactName: z.string().default(""),
    emergencyContactPhone: z.string().default(""),
    emergencyContactRel: z.string().default(""),
    allergies: z.string().default(""),
    chronicConditions: z.string().default(""),
    bloodGroup: z.string().default(""),
    // of these fields means the user wants to enroll this patient
    // (or update the existing enrollment — server decides based on
    // whether the id is provided).
    enrollInInsurance: z.boolean().default(false),
    enrollmentId: z.string().optional().or(z.literal('')).default(""), // existing enrollment id (if any)
    enrollmentInsuranceId: z.string().optional().or(z.literal('')).default(""),
    enrollmentMemberNumber: z.string().max(50).optional().or(z.literal('')).default(""),
    enrollmentPolicyNumber: z.string().max(50).optional().or(z.literal('')).default(""),
    enrollmentCoverageStart: z.string().optional().or(z.literal('')).default(""),
    enrollmentCoverageEnd: z.string().optional().or(z.literal('')).default(""),
    // Next of Kin - made optional for editing existing patients
    nextOfKinName: z.string().default(""),
    nextOfKinPhone: z.string().default(""),
    nextOfKinEmail: z.string().email("Invalid email").or(z.literal('')).default(""),
    nextOfKinAddress: z.string().default(""),
    nextOfKinRel: z.string().default("")
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

export default function EditPatientPage() {
    const params = useParams();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");
    const [insuranceCompanies, setInsuranceCompanies] = useState<any[]>([]);
    // section entirely on the edit form.
    const {
        register,
        handleSubmit,
        watch,
        reset,
        formState: { errors },
    } = useForm<PatientFormValues>({
        resolver: zodResolver(patientSchema) as any,
    });

    const enrollInInsurance = watch("enrollInInsurance");

    useEffect(() => {
        const fetchData = async () => {
            try {
                // and insurance company list in parallel — but only
                // fetch enrollments when insurance is enabled)
                const enabledRes = await
                const enabled = enabledRes.ok ? (await enabledRes.json()).enabled !== false : true;
                // Fetch patient, enrollments (if enabled), and insurance
                // companies in parallel
                const fetches: [Promise<Response>, Promise<Response>, Promise<Response>] = [
                    fetch(`/api/patients/${params.id}`),
                    enabled
                        ? fetch(`/api/patients/${params.id}/insurance`)
                        : Promise.resolve(new Response("[]", { status: 200 })),
                const [patientRes, enrollmentsRes, insuranceRes] = await Promise.all(fetches);
                const p = patientRes.ok ? await patientRes.json() : null;
                const enrollments = enrollmentsRes.ok ? await enrollmentsRes.json() : [];
                const insuranceList = insuranceRes.ok ? await insuranceRes.json() : [];
                if (Array.isArray(insuranceList)) {
                    setInsuranceCompanies(insuranceList.filter((c: any) => c.isActive !== false));
                }

                if (p && patientRes.ok) {
                    // Format date for input
                    const docDate = p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : "";

                    // Normalize legacy gender values ("Male"/"Female") to the
                    // enum casing the form expects ("MALE"/"FEMALE"). The DB
                    // migration cleaned this up, but defending here means we
                    // never strand a patient whose record predates the cleanup.
                    const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER"]);
                    const normalizedGender = (p.gender || "").toUpperCase();
                    const gender = VALID_GENDER.has(normalizedGender) ? normalizedGender : "";

                    // Find the most recent active enrollment (if any)
                    const activeEnrollment = (enrollments || []).find((e: any) => e.isActive)
                        || (enrollments || [])[0]
                        || null;

                    const coverageStart = activeEnrollment?.coverageStart
                        ? new Date(activeEnrollment.coverageStart).toISOString().split('T')[0]
                        : "";
                    const coverageEnd = activeEnrollment?.coverageEnd
                        ? new Date(activeEnrollment.coverageEnd).toISOString().split('T')[0]
                        : "";

                    reset({
                        firstName: p.firstName || "",
                        lastName: p.lastName || "",
                        dateOfBirth: docDate,
                        gender,
                        phone: p.phone || "",
                        email: p.email || "",
                        address: p.address || "",
                        city: p.city || "",
                        emergencyContactName: p.emergencyContactName || "",
                        emergencyContactPhone: p.emergencyContactPhone || "",
                        emergencyContactRel: p.emergencyContactRel || "",
                        allergies: p.allergies || "",
                        chronicConditions: p.chronicConditions || "",
                        bloodGroup: p.bloodGroup || "",
                        enrollInInsurance: !!activeEnrollment,
                        enrollmentId: activeEnrollment?.id ?? "",
                        enrollmentInsuranceId: activeEnrollment?.insuranceId ?? "",
                        enrollmentMemberNumber: activeEnrollment?.memberNumber ?? "",
                        enrollmentPolicyNumber: activeEnrollment?.policyNumber ?? "",
                        enrollmentCoverageStart: coverageStart,
                        enrollmentCoverageEnd: coverageEnd,
                        nextOfKinName: p.nextOfKinName || "",
                        nextOfKinPhone: p.nextOfKinPhone || "",
                        nextOfKinEmail: p.nextOfKinEmail || "",
                        nextOfKinAddress: p.nextOfKinAddress || "",
                        nextOfKinRel: p.nextOfKinRel || ""
                    });
                } else {
                    setServerError(p?.error || "Failed to load patient data");
                }
            } catch (err) {
                console.error("Failed to fetch data", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [params.id, reset]);

    const onSubmit = async (data: PatientFormValues) => {
        setIsSubmitting(true);
        setServerError("");

        try {
            // Build the patient payload (just personal info — R48)
            const submitData: any = {
                firstName: data.firstName,
                lastName: data.lastName,
                dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : undefined,
                gender: data.gender,
                phone: data.phone,
                email: data.email || undefined,
                address: data.address || undefined,
                city: data.city || undefined,
                emergencyContactName: data.emergencyContactName || undefined,
                emergencyContactPhone: data.emergencyContactPhone || undefined,
                emergencyContactRel: data.emergencyContactRel || undefined,
                allergies: data.allergies || undefined,
                chronicConditions: data.chronicConditions || undefined,
                bloodGroup: data.bloodGroup || undefined,
                nextOfKinName: data.nextOfKinName || undefined,
                nextOfKinPhone: data.nextOfKinPhone || undefined,
                nextOfKinEmail: data.nextOfKinEmail || undefined,
                nextOfKinAddress: data.nextOfKinAddress || undefined,
                nextOfKinRel: data.nextOfKinRel || undefined,
            };
            // The server decides whether to create (no id) or update
            // (id present).
            if (data.enrollInInsurance && data.enrollmentInsuranceId) {
                submitData.insuranceEnrollment = {
                    id: data.enrollmentId || undefined, // present = update, absent = create
                    insuranceId: data.enrollmentInsuranceId,
                    memberNumber: data.enrollmentMemberNumber || undefined,
                    policyNumber: data.enrollmentPolicyNumber,
                    coverageStart: data.enrollmentCoverageStart,
                    coverageEnd: data.enrollmentCoverageEnd || undefined,
                };
            }

            const res = await fetch(`/api/patients/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submitData),
            });

            if (!res.ok) {
                const errorData = await res.json();
                // The API returns { error: { code, message, details? } } —
                // `errorData.error` is an object, not a string. Read `.message`
                // and append `.details` if present.
                const errObj = errorData?.error;
                let errorMessage: string;
                if (typeof errObj === 'string') {
                    errorMessage = errObj;
                } else if (errObj?.message) {
                    errorMessage = errObj.message;
                } else {
                    errorMessage = 'Failed to update patient';
                }
                if (errObj?.details) {
                    const detailStr = typeof errObj.details === 'string'
                        ? errObj.details
                        : JSON.stringify(errObj.details);
                    errorMessage = `${errorMessage}: ${detailStr}`;
                }
                throw new Error(errorMessage);
            }

            router.push(`/dashboard/patients/${params.id}`);
            router.refresh();
        } catch (err: any) {
            console.error("Update error:", err);
            setServerError(err.message || "Failed to update patient");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <div className={styles.container}>Loading patient details...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href={`/dashboard/patients/${params.id}`} className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Profile
                </Link>
                                <div className={styles.formGrid}>
                    <div className={styles.formGroupFull}>
                        <label className={styles.checkboxContainer}>
                            <input type="checkbox" {...register("enrollInInsurance")} style={{ width: "16px", height: "16px" }} />
                            Patient has health insurance coverage
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
                <h2 className={styles.sectionTitle}>Next of Kin Information</h2>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Full Name of Next of Kin</label>
                        <input {...register("nextOfKinName")} className={styles.input} placeholder="John Kin" />
                        {errors.nextOfKinName && <span className={styles.errorText}>{errors.nextOfKinName.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Telephone Contact</label>
                        <input {...register("nextOfKinPhone")} className={styles.input} placeholder="0700000000" />
                        {errors.nextOfKinPhone && <span className={styles.errorText}>{errors.nextOfKinPhone.message}</span>}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Email Address</label>
                        <input {...register("nextOfKinEmail")} type="email" className={styles.input} placeholder="kin@example.com" />
                        {errors.nextOfKinEmail && <span className={styles.errorText}>{errors.nextOfKinEmail.message}</span>}
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
                        {errors.nextOfKinRel && <span className={styles.errorText}>{errors.nextOfKinRel.message}</span>}
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Address</label>
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
                        {isSubmitting ? "Updating..." : "Update Patient Record"}
                    </button>
                </div>
            </form>
        </div>
    );
}
