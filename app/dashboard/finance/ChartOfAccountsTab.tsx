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

function AccountRow({ account, level = 0 }: { account: Account; level?: number }) {
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
            </tr>
            {expanded && hasChildren && account.children.map(child => (
                <AccountRow key={child.id} account={child} level={level + 1} />
            ))}
        </>
    );
}

export default function ChartOfAccountsTab() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');

    useEffect(() => {
        fetch('/api/finance/accounts')
            .then(r => r.json())
            .then(d => { setAccounts(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

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
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(account => (
                                <AccountRow key={account.id} account={account} level={0} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
