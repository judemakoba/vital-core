"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { 
    User, 
    Mail, 
    Shield, 
    IdCard, 
    Lock, 
    KeyRound, 
    CheckCircle2, 
    AlertCircle,
    Loader2
} from "lucide-react";
import styles from "./page.module.css";

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);
    
    // Password change state
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    if (status === "loading") {
        return <div className={styles.container}>Loading profile...</div>;
    }

    if (!session) {
        return <div className={styles.container}>Please log in to view your profile.</div>;
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessage({ type: "error", text: "New passwords do not match." });
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setMessage({ type: "error", text: "New password must be at least 6 characters." });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/profile/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: "success", text: "Password changed successfully." });
                setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
            } else {
                setMessage({ type: "error", text: data.error || "Failed to change password." });
            }
        } catch (err) {
            setMessage({ type: "error", text: "An error occurred. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    const getInitials = (name?: string | null) => {
        if (!name) return "U";
        return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    };

    return (
        <div className={styles.container}>
            <div className={styles.profileCard}>
                <div className={styles.cardHeader}>
                    <div className={styles.avatarLarge}>
                        {getInitials(session.user?.name)}
                    </div>
                    <h2 className={styles.userName}>{session.user?.name}</h2>
                    <span className={styles.userRole}>{session.user?.role}</span>
                </div>

                <div className={styles.cardBody}>
                    <h3 className={styles.sectionTitle}>
                        <User size={18} /> Account Details
                    </h3>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoItem}>
                            <span className={styles.label}>Email Address</span>
                            <span className={styles.value}>{session.user?.email}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.label}>Account Role</span>
                            <span className={styles.value}>{session.user?.role}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.label}>User ID</span>
                            <span className={styles.value} style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                {session.user?.id}
                            </span>
                        </div>
                    </div>

                    <div className={styles.divider} />

                    <h3 className={styles.sectionTitle}>
                        <Lock size={18} /> Security & Password
                    </h3>
                    
                    <form onSubmit={handlePasswordChange}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Current Password</label>
                            <input 
                                type="password" 
                                className={styles.input}
                                placeholder="Enter current password"
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                                required
                            />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>New Password</label>
                                <input 
                                    type="password" 
                                    className={styles.input}
                                    placeholder="Min. 6 characters"
                                    value={passwordData.newPassword}
                                    onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Confirm New Password</label>
                                <input 
                                    type="password" 
                                    className={styles.input}
                                    placeholder="Repeat new password"
                                    value={passwordData.confirmPassword}
                                    onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        {message && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5rem', 
                                padding: '0.75rem', 
                                borderRadius: 'var(--radius-md)',
                                fontSize: '0.875rem',
                                marginTop: '1rem',
                                background: message.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: message.type === 'success' ? 'var(--success-color)' : 'var(--danger-color)',
                                fontWeight: 500
                            }}>
                                {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            className="btn-premium btn-primary" 
                            disabled={loading}
                            style={{ 
                                width: '100%', 
                                marginTop: '1.5rem',
                                padding: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                            {loading ? "Updating Password..." : "Change Password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
