"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import styles from "./page.module.css";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API call for password reset email
        setTimeout(() => {
            setIsLoading(false);
            setIsSubmitted(true);
        }, 1000);
    };

    return (
        <div className={styles.container}>
            <div className={`glass-card ${styles.authCard} animate-fade-in`}>
                <Link href="/login" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to login
                </Link>

                <div className={styles.header}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <KeyRound color="var(--primary-color)" size={48} />
                    </div>
                    <h1 className={styles.title}>Forgot Password?</h1>
                    <p className={styles.subtitle}>
                        {isSubmitted
                            ? "We've sent you an email with instructions to reset your password"
                            : "No worries, we'll send you reset instructions."}
                    </p>
                </div>

                {!isSubmitted && (
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                            <input
                                id="email"
                                type="email"
                                required
                                className={styles.input}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={isLoading}
                        >
                            {isLoading ? "Sending..." : "Reset Password"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
