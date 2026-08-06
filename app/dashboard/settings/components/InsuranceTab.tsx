"use client";

import React, { useState, useEffect } from "react";
import { Briefcase, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import styles from "../page.module.css";

export default function InsuranceTab() {
    const [partners, setPartners] = useState<any[]>([]);
    const [message, setMessage] = useState("");
    const [showPartnerForm, setShowPartnerForm] = useState(false);
    const [newPartner, setNewPartner] = useState({ name: "", code: "", contact: "", email: "", standardPatientCopay: "" });

    const fetchPartners = async () => {
        try {
            const res = await fetch("/api/admin/insurance");
            if (res.ok) {
                const data = await res.json();
                setPartners(Array.isArray(data) ? data : []);
            } else {
                const err = await res.json().catch(() => ({}));
                setMessage(`Error: ${err.error || res.statusText}`);
            }
        } catch (err: any) {
            setMessage(`Network error: ${err.message}`);
        }
    };

    useEffect(() => { fetchPartners(); }, []);

    const handleAddPartner = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/admin/insurance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newPartner,
                    standardPatientCopay: newPartner.standardPatientCopay
                        ? parseFloat(newPartner.standardPatientCopay)
                        : 0
                })
            });
            if (res.ok) {
                setShowPartnerForm(false);
                setNewPartner({ name: "", code: "", contact: "", email: "", standardPatientCopay: "" });
                fetchPartners();
            } else {
                const err = await res.json().catch(() => ({}));
                setMessage(err.error || "Failed to add partner");
            }
        } catch (err) {
            setMessage("Failed to add partner");
        }
    };

    const handleDeactivatePartner = async (id: string) => {
        if (!confirm("Deactivate this partner?")) return;
        try {
            const res = await fetch(`/api/admin/insurance/${id}`, { method: "DELETE" });
            if (res.ok) fetchPartners();
        } catch (err) {
            setMessage("Failed to deactivate partner");
        }
    };

    return (
        <div>
            {message && <div style={{ color: "red", marginBottom: "1rem" }}>{message}</div>}

            <div className={styles.section}>
                <h2 className={styles.title}><Briefcase size={24} color="var(--primary-color)" /> Insurance Partners</h2>
                <button className={styles.addPartnerBtn} onClick={() => setShowPartnerForm(!showPartnerForm)}>
                    <Plus size={18} /> {showPartnerForm ? "Cancel" : "Add New Partner"}
                </button>

                {showPartnerForm && (
                    <form onSubmit={handleAddPartner} style={{ marginBottom: "2rem", padding: "1rem", background: "rgba(0,0,0,0.02)", borderRadius: "var(--radius-md)" }}>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Company Name *</label>
                                <input className={styles.input} value={newPartner.name}
                                    onChange={e => setNewPartner({ ...newPartner, name: e.target.value })} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Company Code *</label>
                                <input className={styles.input} value={newPartner.code}
                                    onChange={e => setNewPartner({ ...newPartner, code: e.target.value })} required placeholder="e.g. JUB" />
                            </div>
                        </div>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Contact Phone</label>
                                <input className={styles.input} value={newPartner.contact}
                                    onChange={e => setNewPartner({ ...newPartner, contact: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Patient Copay (UGX, optional)</label>
                                <input type="number" className={styles.input} value={newPartner.standardPatientCopay}
                                    onChange={e => setNewPartner({ ...newPartner, standardPatientCopay: e.target.value })} placeholder="0 = no copay" />
                            </div>
                        </div>
                        <button type="submit" className={styles.saveBtn} style={{ marginTop: "1rem" }}>Save Partner</button>
                    </form>
                )}

                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Partner Name</th>
                            <th>Code</th>
                            <th>Patient Copay</th>
                            <th>Negotiated Items</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {partners.map(partner => (
                            <tr key={partner.id}>
                                <td>{partner.name}</td>
                                <td><span style={{ fontFamily: "monospace" }}>{partner.code}</span></td>
                                <td>
                                    {partner.standardPatientCopay > 0
                                        ? `UGX ${partner.standardPatientCopay.toLocaleString()}`
                                        : <span style={{ color: "var(--text-muted)" }}>None</span>
                                    }
                                </td>
                                <td>{partner._count?.priceList ?? 0}</td>
                                <td>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <Link href={`/dashboard/admin/insurance/${partner.id}/price-list`} className={styles.actionBtn} style={{ color: "var(--primary-color)" }}>
                                            Price List
                                        </Link>
                                        <Link href={`/dashboard/admin/insurance/${partner.id}`} className={styles.actionBtn}>
                                            Details
                                        </Link>
                                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeactivatePartner(partner.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {partners.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No insurance partners yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
