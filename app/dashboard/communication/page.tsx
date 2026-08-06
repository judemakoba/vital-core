"use client";

import { useState, useEffect } from "react";
import { Mail, Search, Send, User, MessageCircle, Clock, CheckCircle, AlertCircle } from "lucide-react";
import styles from "./page.module.css";

export default function CommunicationPage() {
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [message, setMessage] = useState("");
    const [history, setHistory] = useState<any[]>([]);
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Search patients
    useEffect(() => {
        if (search.length < 2) {
            setPatients([]);
            return;
        }
        const delay = setTimeout(async () => {
            const res = await fetch(`/api/patients?search=${search}`);
            if (res.ok) {
                const data = await res.json();
                // /api/patients returns { data: patients[], total, page, ... } — accept both shapes
                const list = Array.isArray(data) ? data : (data.patients ?? data.data ?? []);
                setPatients(list);
            }
        }, 300);
        return () => clearTimeout(delay);
    }, [search]);

    // Fetch history
    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch("/api/notifications/sms");
            if (res.ok) setHistory(await res.json());
        } catch (err) { }
        setLoadingHistory(false);
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient || !message) return;

        setSending(true);
        try {
            const res = await fetch("/api/notifications/sms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientId: selectedPatient.id,
                    message,
                    phone: selectedPatient.phone
                })
            });
            if (res.ok) {
                setMessage("");
                fetchHistory();
            }
        } catch (err) { }
        setSending(false);
    };

    return (
        <div className={styles.container}>
            <h1 className="title">Communication Center</h1>

            <div className={styles.grid}>
                {/* Left: Send Module */}
                <div className={styles.card}>
                    <h2 className={styles.title}><Send size={20} /> New SMS</h2>
                    <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Search Patient</label>
                            <div className="search-box">
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Type name or phone..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            {patients.length > 0 && !selectedPatient && (
                                <div className="glass-card" style={{ position: "absolute", width: "310px", marginTop: "4.5rem", zIndex: 10, padding: 0 }}>
                                    {patients.slice(0, 5).map(p => (
                                        <div
                                            key={p.id}
                                            style={{ padding: "0.75rem", cursor: "pointer", borderBottom: "1px solid var(--border-color)" }}
                                            onClick={() => { setSelectedPatient(p); setSearch(`${p.firstName} ${p.lastName}`); setPatients([]); }}
                                        >
                                            <strong>{p.firstName} {p.lastName}</strong>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.phone}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedPatient && (
                            <div className="glass-card" style={{ padding: "0.75rem", borderLeft: "4px solid var(--primary-color)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <strong>To: {selectedPatient.firstName} {selectedPatient.lastName}</strong>
                                    <button onClick={() => setSelectedPatient(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger-color)" }}>Clear</button>
                                </div>
                                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{selectedPatient.phone}</div>
                            </div>
                        )}

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Message Content</label>
                            <textarea
                                className={styles.textarea}
                                placeholder="Type your message here..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                maxLength={160}
                                required
                            />
                            <div style={{ fontSize: "0.75rem", textAlign: "right", color: "var(--text-muted)" }}>{message.length}/160 characters</div>
                        </div>

                        <button type="submit" className={styles.sendBtn} disabled={sending || !selectedPatient}>
                            {sending ? "Sending..." : "Send Message"}
                        </button>
                    </form>
                </div>

                {/* Right: History Module */}
                <div className={styles.card}>
                    <h2 className={styles.title}><Clock size={20} /> Recent Communications</h2>
                    <div className={styles.history}>
                        {loadingHistory ? (
                            <p>Loading logs...</p>
                        ) : history.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                                <MessageCircle size={48} style={{ opacity: 0.1, margin: "0 auto 1rem" }} />
                                <p>No messages sent yet.</p>
                            </div>
                        ) : (
                            history.map(log => (
                                <div key={log.id} className={styles.logEntry}>
                                    <div className={styles.logHeader}>
                                        <div>
                                            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>SMS Notification</span>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{new Date(log.createdAt).toLocaleString()}</div>
                                        </div>
                                        <span className={`${styles.logStatus} ${log.status === 'Sent' ? styles.statusSent : log.status === 'Failed' ? styles.statusFailed : styles.statusPending}`}>
                                            {log.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.875rem", margin: 0 }}>{log.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
