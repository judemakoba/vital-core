'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Search,
    Filter,
    ShieldAlert,
    CheckCircle,
    XCircle,
    Clock,
    Activity,
    AlertCircle
} from 'lucide-react';
import styles from './page.module.css';

interface Authorization {
    id: string;
    requestNumber: string;
    patientInsurance: {
        patient: { firstName: string; lastName: string; patientNumber: string };
        insurance: { name: string; code: string };
        package: { name: string } | null;
    };
    serviceType: string;
    serviceName: string;
    estimatedCost: number;
    authorizedAmount: number | null;
    status: string;
    requestDate: string;
    authorizationCode: string | null;
}

export default function AuthorizationsDashboardPage() {
    const [auths, setAuths] = useState<Authorization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchAuths();
    }, [statusFilter]);

    const fetchAuths = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/insurance/authorizations?status=${statusFilter}`);
            if (!res.ok) throw new Error('Failed to load authorizations');
            const data = await res.json();
            setAuths(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (authId: string, action: 'APPROVED' | 'REJECTED') => {
        const code = action === 'APPROVED' ? prompt("Enter Authorization Code from Provider:") : null;
        if (action === 'APPROVED' && (!code || code.trim() === '')) return;

        const reason = action === 'REJECTED' ? prompt("Enter rejection reason:") : null;

        try {
            const res = await fetch(`/api/admin/insurance/authorizations/${authId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: action,
                    authorizationCode: code,
                    notes: reason
                })
            });
            if (res.ok) fetchAuths();
        } catch (err) {
            console.error(err);
        }
    };

    const filteredAuths = auths.filter(a =>
        a.requestNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.patientInsurance.patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.patientInsurance.patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.patientInsurance.insurance.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.serviceName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatCurrency = (val: number) => `UGX ${val.toLocaleString()}`;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <Link href="/dashboard/admin/insurance" className={styles.backLink}>
                        <ArrowLeft size={16} /> Back to Insurance Settings
                    </Link>
                    <h1 className={styles.title}>Pre-Authorizations</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Review and manage pending pre-auth requests</p>
                </div>
            </header>

            <div className={`glass-card ${styles.filtersCard}`}>
                <div className={styles.searchBox}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search request #, patient, service..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className={styles.filterGroup}>
                    <Filter size={18} color="var(--text-muted)" />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending Review</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className={styles.centerState}>
                    <Activity className="spin" size={32} />
                    <p>Loading requests...</p>
                </div>
            ) : error ? (
                <div className={styles.centerState}>
                    <AlertCircle size={32} color="var(--danger-color)" />
                    <p>{error}</p>
                    <button onClick={fetchAuths} className="btn-secondary">Retry</button>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Request # / Date</th>
                                <th>Patient & Provider</th>
                                <th>Service Requested</th>
                                <th style={{ textAlign: 'right' }}>Est. Cost</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAuths.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                                        <p style={{ color: 'var(--text-muted)' }}>No authorization requests found.</p>
                                    </td>
                                </tr>
                            ) : filteredAuths.map(auth => (
                                <tr key={auth.id}>
                                    <td>
                                        <strong>{auth.requestNumber}</strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {new Date(auth.requestDate).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>
                                            {auth.patientInsurance.patient.firstName} {auth.patientInsurance.patient.lastName}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {auth.patientInsurance.insurance.name} — {auth.patientInsurance.package?.name || 'Base'}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{auth.serviceName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type: {auth.serviceType}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                        {formatCurrency(auth.estimatedCost)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className={`${styles.statusBadge} ${styles[auth.status.toLowerCase()]}`}>
                                            {auth.status === 'PENDING' && <Clock size={14} />}
                                            {auth.status === 'APPROVED' && <CheckCircle size={14} />}
                                            {auth.status === 'REJECTED' && <XCircle size={14} />}
                                            {auth.status}
                                        </span>
                                        {auth.authorizationCode && (
                                            <div style={{ fontSize: '0.65rem', marginTop: '4px', fontFamily: 'monospace' }}>
                                                Code: {auth.authorizationCode}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div className={styles.actionButtons} style={{ justifyContent: 'flex-end' }}>
                                            {auth.status === 'PENDING' && (
                                                <>
                                                    <button onClick={() => handleAction(auth.id, 'APPROVED')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--success-color)' }}>
                                                        Approve
                                                    </button>
                                                    <button onClick={() => handleAction(auth.id, 'REJECTED')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--danger-color)' }}>
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
