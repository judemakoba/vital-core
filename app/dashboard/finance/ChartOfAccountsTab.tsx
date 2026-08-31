'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';

interface Account {
    id: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    category: string;
    isControlAccount: boolean;
    isActive: boolean;
    openingBalance: number;
    description: string | null;
    children: Account[];
}

const TYPE_COLORS: Record<string, string> = {
    ASSET: styles.typeAsset,
    LIABILITY: styles.typeLiability,
    EQUITY: styles.typeEquity,
    REVENUE: styles.typeRevenue,
    EXPENSE: styles.typeExpense,
};

function AccountRow({ account, level = 0, onEdit }: { account: Account; level?: number; onEdit: (a: Account) => void }) {
    const [expanded, setExpanded] = useState(level < 2);
    const hasChildren = account.children.length > 0;

    return (
        <>
            <tr className={`${styles.accountRow} ${account.isControlAccount ? styles.controlRow : ''}`}
                style={{ '--level': level } as any}>
                <td>
                    <div className={styles.accountName} style={{ paddingLeft: `${level * 20}px` }}>
                        {hasChildren && (
                            <button className={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
                                {expanded ? '▼' : '▶'}
                            </button>
                        )}
                        <span className={account.isControlAccount ? styles.controlLabel : ''}>{account.accountName}</span>
                    </div>
                </td>
                <td className={styles.accountCode}>{account.accountCode}</td>
                <td>
                    <span className={`${styles.typeBadge} ${TYPE_COLORS[account.accountType] ?? ''}`}>
                        {account.accountType}
                    </span>
                </td>
                <td className={styles.categoryCell}>{account.category.replace(/_/g, ' ')}</td>
                <td className={styles.numCell}>
                    {account.openingBalance !== 0 ? account.openingBalance.toLocaleString() : '—'}
                </td>
                <td>
                    <span className={account.isActive ? styles.active : styles.inactive}>
                        {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button type="button" className={styles.editBtn} onClick={() => onEdit(account)} title="Edit account">
                        ✏️
                    </button>
                </td>
            </tr>
            {expanded && hasChildren && account.children.map(child => (
                <AccountRow key={child.id} account={child} level={level + 1} onEdit={onEdit} />
            ))}
        </>
    );
}

export default function ChartOfAccountsTab() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [editing, setEditing] = useState<Account | null>(null);

    const load = () => {
        setLoading(true);
        fetch('/api/finance/accounts')
            .then(r => r.json())
            .then(d => { setAccounts(d); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const filterAccounts = (accs: Account[]): Account[] => {
        if (!search && !filterType) return accs;
        return accs
            .map(a => ({
                ...a,
                children: filterAccounts(a.children),
            }))
            .filter(a =>
                a.children.length > 0 ||
                (!search || a.accountName.toLowerCase().includes(search.toLowerCase()) || a.accountCode.includes(search)) &&
                (!filterType || a.accountType === filterType)
            );
    };

    const filtered = filterAccounts(accounts);

    return (
        <div>
            <div className={styles.toolbarRow}>
                <input
                    className={styles.searchInput}
                    placeholder="Search accounts…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select className={styles.filterSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">All Types</option>
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="REVENUE">Revenue</option>
                    <option value="EXPENSE">Expense</option>
                </select>
                <button className={styles.btnPrimary}>+ Add Account</button>
            </div>

            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.accountsTable}>
                        <thead>
                            <tr>
                                <th>Account Name</th>
                                <th>Code</th>
                                <th>Type</th>
                                <th>Category</th>
                                <th className={styles.numCell}>Opening Balance</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(account => (
                                <AccountRow key={account.id} account={account} level={0} onEdit={setEditing} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <EditAccountModal
                    account={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

function EditAccountModal({ account, onClose, onSaved }: {
    account: Account;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [openingBalance, setOpeningBalance] = useState<string>(String(account.openingBalance ?? 0));
    const [isActive, setIsActive] = useState<boolean>(account.isActive);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            // Parse the balance, allowing blanks → 0
            const parsed = openingBalance.trim() === '' ? 0 : Number(openingBalance);
            if (!Number.isFinite(parsed)) {
                setError('Opening balance must be a number');
                setSaving(false);
                return;
            }
            const res = await fetch(`/api/finance/accounts/${account.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ openingBalance: parsed, isActive }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            onSaved();
        } catch (e: any) {
            setError(e.message || 'Failed to save');
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalBackdrop} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3>Edit Account — {account.accountCode} {account.accountName}</h3>
                    <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Account Type</label>
                        <div className={styles.readOnly}>
                            <span className={`${styles.typeBadge} ${TYPE_COLORS[account.accountType] ?? ''}`}>
                                {account.accountType}
                            </span>
                            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                                {account.category.replace(/_/g, ' ')}
                            </span>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="openingBalance">Opening Balance (UGX)</label>
                        <input
                            id="openingBalance"
                            type="number"
                            step="0.01"
                            className={styles.textInput}
                            value={openingBalance}
                            onChange={e => setOpeningBalance(e.target.value)}
                            disabled={saving}
                        />
                        <span className={styles.formHint}>
                            For Asset/Expense accounts, positive means debit. For Liability/Equity/Revenue, positive means credit.
                            This is the day-one balance — the report starts here and adds journal movement on top.
                        </span>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={e => setIsActive(e.target.checked)}
                                disabled={saving}
                            />
                            <span style={{ marginLeft: 8 }}>Active</span>
                        </label>
                        <span className={styles.formHint}>
                            Inactive accounts are hidden from reports but their historical journal entries remain.
                        </span>
                    </div>
                    {error && <div className={styles.errorBanner}>{error}</div>}
                </div>
                <div className={styles.modalFooter}>
                    <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
