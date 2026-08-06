'use client';

import { useState, useEffect } from 'react';
import { Search, Pill, User, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import styles from './pharmacy.module.css';

interface Patient {
    id: string;
    firstName: string;
    lastName: string;
    patientNumber: string;
    allergies?: string | null;
}

interface FormularyDrug {
    id: string;
    name: string;
    genericName: string;
    strength: string;
    strengthValue: number | null;
    strengthUnit: string | null;
    dosageForm: string;
}

interface Prescription {
    id: string;
    medicationName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    instructions: string | null;
    doctor: { name: string };
    status: string;
    // New structured dose fields
    doseAmount: number | null;
    doseUnit: string | null;
    frequencyPerDay: number | null;
    isManualQuantity: boolean;
    drug: FormularyDrug | null;
}

interface Visit {
    id: string;
    visitNumber: string;
    createdAt: string;
    patient: Patient;
    prescriptions: Prescription[];
}

interface Drug {
    id: string;
    name: string;
    genericName: string;
    strength: string;
    strengthValue: number | null;
    strengthUnit: string | null;
    dosageForm: string;
}

interface Batch {
    id: string;
    batchNumber: string;
    expiryDate: string;
    quantityRemaining: number;
    isExpired: boolean;
    isSplittable: boolean;
}

// Pending confirmation: { id: prescriptionId, mode: 'auto' | 'manual' }
type PendingDispense = { id: string; mode: 'auto' | 'manual' } | null;

export default function DispensingTab({ onDispenseSuccess }: { onDispenseSuccess?: () => void }) {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [dispensingId, setDispensingId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const [successId, setSuccessId] = useState<string | null>(null); // inline success banner
    const [pendingDispense, setPendingDispense] = useState<PendingDispense>(null); // inline confirm
    
    // Manual Selection State
    const [activePrescId, setActivePrescId] = useState<string | null>(null);
    const [drugSearch, setDrugSearch] = useState('');
    const [drugResults, setDrugResults] = useState<Drug[]>([]);
    const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string>('');
    const [searchingDrugs, setSearchingDrugs] = useState(false);
    // Manual quantity the pharmacist enters before dispensing
    const [manualQty, setManualQty] = useState<number | null>(null);
    // Manual dose inputs for pharmacist calculation
    const [unitsPerDoseInput, setUnitsPerDoseInput] = useState<number | null>(null);
    const [freqPerDayInput, setFreqPerDayInput] = useState<number | null>(null);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pharmacy/prescriptions?search=${search}`);
            if (res.ok) {
                const data = await res.json();
                setVisits(data);
                if (selectedVisit) {
                    const updated = data.find((v: Visit) => v.id === selectedVisit.id);
                    setSelectedVisit(updated || null);
                }
            }
        } catch (error) {
            console.error('Failed to fetch pending prescriptions:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPending();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Auto-select the first (highest-priority) visit when queue loads
    useEffect(() => {
        if (!loading && visits.length > 0 && !selectedVisit) {
            setSelectedVisit(visits[0]);
        }
    }, [loading, visits]);

    // Search for drugs
    useEffect(() => {
        if (!drugSearch || drugSearch.length < 2) {
            setDrugResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setSearchingDrugs(true);
            try {
                const res = await fetch(`/api/pharmacy/drugs?search=${drugSearch}`);
                if (res.ok) {
                    const data = await res.json();
                    setDrugResults(data);
                }
            } catch (error) {
                console.error('Drug search error:', error);
            } finally {
                setSearchingDrugs(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [drugSearch]);

    // Fetch batches when drug is selected
    useEffect(() => {
        if (!selectedDrug) {
            setBatches([]);
            setSelectedBatchId('');
            return;
        }

        const fetchBatches = async () => {
            try {
                const res = await fetch(`/api/pharmacy/batches?drugId=${selectedDrug.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setBatches(data);
                    // Auto-select the first NON-expired batch (FEFO order from API)
                    const firstValid = data.find((b: Batch) => !b.isExpired);
                    setSelectedBatchId(firstValid?.id || '');
                }
            } catch (error) {
                console.error('Batch fetch error:', error);
            }
        };

        fetchBatches();
    }, [selectedDrug]);

    const startManualSelection = async (prescription: Prescription) => {
        setActivePrescId(prescription.id);
        setDrugSearch(prescription.medicationName);
        setSelectedDrug(null);
        setSelectedBatchId('');
        setManualQty(null);
        setUnitsPerDoseInput(null);
        setFreqPerDayInput(null);
        // Immediately fetch matching drugs so results appear without waiting for debounce
        try {
            const res = await fetch(`/api/pharmacy/drugs?search=${encodeURIComponent(prescription.medicationName)}`);
            if (res.ok) {
                const data = await res.json();
                setDrugResults(data);
                // Auto-select exact match, or first result; pre-fill calculation inputs
                const exact = data.find((d: Drug) =>
                    d.name.toLowerCase() === prescription.medicationName.toLowerCase() ||
                    d.genericName.toLowerCase() === prescription.medicationName.toLowerCase()
                );
                const toSelect = exact ?? (data.length === 1 ? data[0] : null);

                if (toSelect) {
                    setSelectedDrug(toSelect);
                    // Pre-fill: units per dose (doseAmount / drug strength) and frequency
                    const unitsPerDose = (toSelect.strengthValue != null && toSelect.strengthValue > 0
                        && prescription.doseAmount != null)
                        ? +(prescription.doseAmount / toSelect.strengthValue).toFixed(2)
                        : null;
                    const suggested = unitsPerDose != null && prescription.frequencyPerDay != null
                        ? Math.ceil(unitsPerDose * prescription.frequencyPerDay * prescription.durationDays)
                        : prescription.quantity;
                    setUnitsPerDoseInput(unitsPerDose);
                    setFreqPerDayInput(prescription.frequencyPerDay);
                    setManualQty(suggested);
                }
            }
        } catch (error) {
            console.error('Pre-fetch drug error:', error);
        }
    };

    const handleDispense = async (prescriptionId: string, manualDrugId?: string, manualBatchId?: string) => {
        // Called only after inline confirmation — no window.confirm()
        setPendingDispense(null);
        setDispensingId(prescriptionId);
        try {
            const res = await fetch('/api/pharmacy/dispense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prescriptionId, manualDrugId, manualBatchId, manualQuantity: manualQty })
            });

            if (res.ok) {
                const data = await res.json();
                const qty = data?.doseCalc?.totalUnits;
                const drugName = data?.drug?.name;
                // Success message shows the actual dose-calculated quantity, not just the rx quantity
                setSuccessId(qty && drugName
                    ? `disp:${drugName}:${qty}`
                    : prescriptionId);
                setTimeout(() => { setSuccessId(null); }, 5000);
                setActivePrescId(null);
                fetchPending();
                onDispenseSuccess?.();
            } else {
                const error = await res.json();
                // Show inline error banner instead of alert
                setSuccessId(`err:${error.error || 'Failed to dispense'}`);
                setTimeout(() => setSuccessId(null), 5000);
            }
        } catch (error) {
            console.error('Dispensing error:', error);
            setSuccessId('err:An unexpected error occurred.');
            setTimeout(() => setSuccessId(null), 5000);
        } finally {
            setDispensingId(null);
        }
    };

    return (
        <div className={styles.tabContent}>
            <div className={styles.tabActions}>
                <div className={styles.searchContainer} style={{ flex: 1 }}>
                    <Search className={styles.searchIcon} size={18} />
                    <input 
                        type="text" 
                        placeholder="Search patient name, number, or visit #..." 
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button className={styles.btnSecondary} onClick={() => fetchPending()}>
                    <RefreshCw size={16} />
                    Refresh Queue
                </button>
            </div>

            <div className={styles.dispenseGrid}>
                <div className={styles.queueSidebar}>
                    <div className={styles.sidebarHeader}>
                        <h4>Prescription Queue</h4>
                        <span className={styles.countBadge}>{visits.length}</span>
                    </div>
                    <div className={styles.queueList}>
                        {loading && <div className={styles.loadingSmall}>Loading queue...</div>}
                        {!loading && visits.length === 0 && (
                            <div className={styles.emptyQueue}>No pending prescriptions found.</div>
                        )}
                        {!loading && (() => {
                            const pharmacyVisits = visits.filter(v => (v as any).status === 'Pharmacy');
                            const otherVisits = visits.filter(v => (v as any).status !== 'Pharmacy');
                            return (
                                <>
                                    {pharmacyVisits.length > 0 && (
                                        <>
                                            <div style={{
                                                padding: '6px 12px',
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                color: '#c2410c',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                background: '#fff7ed',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                🚨 Ready for Dispensing ({pharmacyVisits.length})
                                            </div>
                                            {pharmacyVisits.map((visit) => (
                                                <div
                                                    key={visit.id}
                                                    className={`${styles.queueItem} ${styles.queueItemPriority} ${selectedVisit?.id === visit.id ? styles.queueItemActive : ''}`}
                                                    onClick={() => { setSelectedVisit(visit); setActivePrescId(null); }}
                                                >
                                                    <div className={styles.patientAvatarSmall}>
                                                        <User size={20} />
                                                    </div>
                                                    <div className={styles.queueInfo}>
                                                        <div className={styles.queuePatientName}>{visit.patient.firstName} {visit.patient.lastName}</div>
                                                        <div className={styles.queueVisitMeta}>{visit.visitNumber} • {new Date(visit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                        <div className={styles.prescriptionCount}>
                                                            <Pill size={12} style={{ marginRight: '4px' }} />
                                                            {visit.prescriptions.length} items pending
                                                        </div>
                                                        <span className={styles.priorityBadge}>🚨 Sent to Pharmacy</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {otherVisits.length > 0 && (
                                        <>
                                            {pharmacyVisits.length > 0 && (
                                                <div style={{
                                                    padding: '6px 12px',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                    color: '#6b7280',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.06em'
                                                }}>
                                                    Other Pending ({otherVisits.length})
                                                </div>
                                            )}
                                            {otherVisits.map((visit) => {
                                                // Show a hint if the patient is currently bouncing
                                                // through another station (lab, radiology, etc.) but still
                                                // has a Pending prescription.
                                                const stageHint = (() => {
                                                    switch ((visit as any).status) {
                                                        case 'Radiology': return '🩻 Also in Radiology';
                                                        case 'Laboratory':
                                                        case 'Lab':       return '🧪 Also in Lab';
                                                        case 'In-Lab':    return '🧪 In Lab';
                                                        case 'Awaiting-Results': return '🧪 Awaiting Lab Results';
                                                        case 'Consultation':
                                                        case 'Doctor':    return '👨‍⚕️ Awaiting Doctor';
                                                        case 'Triage':
                                                        case 'Triaged':   return '🩺 Awaiting Triage';
                                                        case 'Billing':   return '💳 At Billing';
                                                        case 'Completed': return '✅ Visit closed';
                                                        default:          return `📍 Stage: ${(visit as any).status || 'Unknown'}`;
                                                    }
                                                })();
                                                return (
                                                <div
                                                    key={visit.id}
                                                    className={`${styles.queueItem} ${selectedVisit?.id === visit.id ? styles.queueItemActive : ''}`}
                                                    onClick={() => { setSelectedVisit(visit); setActivePrescId(null); }}
                                                >
                                                    <div className={styles.patientAvatarSmall}>
                                                        <User size={20} />
                                                    </div>
                                                    <div className={styles.queueInfo}>
                                                        <div className={styles.queuePatientName}>{visit.patient.firstName} {visit.patient.lastName}</div>
                                                        <div className={styles.queueVisitMeta}>{visit.visitNumber} • {new Date(visit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                        <div className={styles.prescriptionCount}>
                                                            <Pill size={12} style={{ marginRight: '4px' }} />
                                                            {visit.prescriptions.length} items pending
                                                        </div>
                                                        <span style={{
                                                            marginTop: 4,
                                                            fontSize: '0.7rem',
                                                            color: '#6b7280',
                                                            background: 'rgba(107, 114, 128, 0.1)',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            display: 'inline-block',
                                                        }}>
                                                            {stageHint}
                                                        </span>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>

                <div className={styles.dispenseMain}>
                    {selectedVisit ? (
                        <div className={styles.dispenseDetails}>
                            <div className={styles.detailsHeader}>
                                <div>
                                    <h3>Dispensing Interface</h3>
                                    <p className={styles.textMuted}>{selectedVisit.patient.firstName} {selectedVisit.patient.lastName} ({selectedVisit.patient.patientNumber})</p>
                                </div>
                                <div className={styles.visitBadge}>{selectedVisit.visitNumber}</div>
                            </div>
                            
                            {selectedVisit.patient.allergies && (
                                <div style={{
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    color: '#dc2626',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                    fontSize: '0.875rem'
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <strong>⚠️ ALLERGY ALERT:</strong> {selectedVisit.patient.allergies}
                                        <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
                                            Verify all medications are safe before dispensing
                                        </div>
                                    </div>
                                </div>
                            )}

                            {successId && !successId.startsWith('err:') && !successId.startsWith('disp:') && (
                                <div className={styles.successBanner}>
                                    <CheckCircle2 size={16} />
                                    Medication dispensed successfully!
                                </div>
                            )}
                            {successId && successId.startsWith('disp:') && (() => {
                                const [, drugName, qty] = successId.split(':');
                                return (
                                    <div className={styles.successBanner}>
                                        <CheckCircle2 size={16} />
                                        {drugName && qty
                                            ? `Dispensed ${qty} units of ${drugName} — successfully recorded`
                                            : 'Medication dispensed successfully!'
                                        }
                                    </div>
                                );
                            })()}
                            {successId && successId.startsWith('err:') && (
                                <div className={styles.errorBanner}>
                                    <AlertCircle size={16} />
                                    {successId.slice(4)}
                                </div>
                            )}

                            <div className={styles.prescriptionList}>
                                {selectedVisit.prescriptions.map((p) => {
                                    // ── Dose Calculation ─────────────────────────────────────────────────
                                    // Units-per-dose = doseAmount / drug's base strength
                                    // Total = ceil(unitsPerDose × frequencyPerDay × durationDays)
                                    const unitsPerDose = (p.doseAmount != null && p.drug?.strengthValue != null && p.drug.strengthValue > 0)
                                        ? p.doseAmount / p.drug.strengthValue
                                        : null;
                                    const autoQty = (unitsPerDose != null && p.frequencyPerDay != null)
                                        ? Math.ceil(unitsPerDose * p.frequencyPerDay * p.durationDays)
                                        : null;
                                    const hasFractional = unitsPerDose != null && !Number.isInteger(unitsPerDose);
                                    const hasStrength = p.drug?.strengthValue != null && p.drug.strengthValue > 0;
                                    // Mismatch: the quantity on the prescription differs from what dose math says
                                    const qtyMismatch = autoQty != null && p.quantity !== autoQty;
                                    const manualOverrideNote = p.isManualQuantity ? ' (manual override)' : '';

                                    // ── Manual substitute quantity ──────────────────────────────────────
                                    // When pharmacist selects a different drug, recalculate using THAT drug's strength
                                    const substituteQty = (selectedDrug != null && p.doseAmount != null && p.frequencyPerDay != null && selectedDrug.strengthValue != null && selectedDrug.strengthValue > 0)
                                        ? Math.ceil((p.doseAmount / selectedDrug.strengthValue) * p.frequencyPerDay * p.durationDays)
                                        : null;
                                    const substituteHasFractional = (selectedDrug != null && p.doseAmount != null && p.frequencyPerDay != null && selectedDrug.strengthValue != null && selectedDrug.strengthValue > 0)
                                        ? !Number.isInteger(p.doseAmount / selectedDrug.strengthValue)
                                        : null;

                                    return (
                                    <div key={p.id} className={`${styles.prescriptionCard} ${activePrescId === p.id ? styles.prescriptionCardOverride : ''}`}>
                                        <div className={styles.prescHead}>
                                            <div className={styles.prescInfo}>
                                                <div className={styles.drugTitle}>{p.medicationName}</div>
                                                <div className={styles.drugMeta}>{p.dosage} &bull; {p.frequency} &bull; {p.durationDays} days</div>
                                                {p.instructions && <div className={styles.drugInstructions}>"{p.instructions}"</div>}

                                                {/* Dose vs Strength Math */}
                                                {p.drug && hasStrength && p.doseAmount != null && p.doseUnit && p.frequencyPerDay != null ? (
                                                    <div style={{
                                                        marginTop: '6px',
                                                        padding: '6px 10px',
                                                        background: '#f0fdf4',
                                                        border: `1px solid ${qtyMismatch ? '#f59e0b' : '#bbf7d0'}`,
                                                        borderRadius: '6px',
                                                        fontSize: '11.5px',
                                                        color: '#166534',
                                                        lineHeight: '1.6'
                                                    }}>
                                                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                                            📐 Dose Calculation
                                                            {qtyMismatch && <span style={{ color: '#d97706', fontWeight: 600, marginLeft: '6px' }}>⚠ qty mismatch</span>}
                                                        </div>
                                                        {hasFractional ? (
                                                            <>
                                                                <span style={{ color: '#92400e' }}>
                                                                    {p.doseAmount}{p.doseUnit} ÷ {p.drug.strengthValue}{p.drug.strengthUnit ?? 'mg'} = <strong>{unitsPerDose!.toFixed(2)}</strong> tablets/dose (fractional)
                                                                </span>
                                                                <div style={{ fontSize: '10.5px', color: '#92400e', marginTop: '2px' }}>
                                                                    → {Math.ceil(unitsPerDose!)} tablets × {p.frequencyPerDay}×/day × {p.durationDays}d = <strong>{autoQty} units</strong> (rounded up)
                                                                </div>
                                                                <div style={{ fontSize: '10.5px', color: '#b91c1c', marginTop: '3px', fontWeight: 600 }}>
                                                                    ⚠ Fractional — ensure batch is splittable (scored tablets)
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <span>
                                                                {p.doseAmount}{p.doseUnit} ÷ {p.drug.strengthValue}{p.drug.strengthUnit ?? 'mg'} = <strong>{unitsPerDose!.toFixed(0)}</strong> tablet{unitsPerDose !== 1 ? 's' : ''}/dose
                                                                &nbsp;→&nbsp; {unitsPerDose!.toFixed(0)} × {p.frequencyPerDay}×/day × {p.durationDays}d = <strong>{autoQty} units</strong>{manualOverrideNote && <span style={{ color: '#d97706' }}>{manualOverrideNote}</span>}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : p.drug ? (
                                                    <div style={{
                                                        marginTop: '6px',
                                                        fontSize: '11px',
                                                        color: '#6b7280',
                                                        fontStyle: 'italic'
                                                    }}>
                                                        Formulary: {p.drug.name} ({p.drug.strength}) — quantity entered manually
                                                        {manualOverrideNote && <span style={{ color: '#d97706' }}>{manualOverrideNote}</span>}
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        marginTop: '6px',
                                                        fontSize: '11px',
                                                        color: '#d97706',
                                                        fontStyle: 'italic'
                                                    }}>
                                                        ⚠ Not in formulary — no strength data available for dose calculation
                                                    </div>
                                                )}
                                            </div>
                                            <div className={styles.prescQty}>
                                                <div className={styles.qtyVal} style={qtyMismatch ? { color: '#d97706' } : undefined}>
                                                    {autoQty ?? p.quantity}
                                                </div>
                                                <div className={styles.qtyLabel}>Rx Units</div>
                                                {qtyMismatch && (
                                                    <div style={{ fontSize: '10px', color: '#d97706', marginTop: '2px', fontWeight: 600 }}>
                                                        calc: {autoQty}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {activePrescId === p.id ? (
                                            <div className={styles.selectionOverride}>
                                                <div className={styles.overrideHeader}>
                                                    <h4>Drug &amp; Batch Selection</h4>
                                                    <button className={styles.btnChange} onClick={() => setActivePrescId(null)}>Cancel</button>
                                                </div>

                                                <div className={styles.searchArea}>
                                                    <div className={styles.searchContainer}>
                                                        <Search className={styles.searchIcon} size={16} />
                                                        <input 
                                                            type="text" 
                                                            className={styles.searchInput} 
                                                            placeholder="Search drug to dispense..."
                                                            value={drugSearch}
                                                            onChange={(e) => setDrugSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    
                                                    {drugResults.length > 0 && !selectedDrug && (
                                                        <div className={styles.drugResultList}>
                                                            {drugResults.map(d => {
                                                                const visit = visits.find(v => v.prescriptions.some(p => p.id === activePrescId));
                                                                const presc = visit?.prescriptions.find(p => p.id === activePrescId);
                                                                const unitsPerDose = presc && d.strengthValue != null && d.strengthValue > 0
                                                                    ? +(presc.doseAmount! / d.strengthValue).toFixed(2)
                                                                    : null;
                                                                const suggested = unitsPerDose != null && presc?.frequencyPerDay != null
                                                                    ? Math.ceil(unitsPerDose * presc.frequencyPerDay * presc.durationDays)
                                                                    : presc?.quantity ?? 0;
                                                                return (
                                                                    <div key={d.id} className={styles.drugResultItem} onClick={() => {
                                                                        setSelectedDrug(d);
                                                                        setUnitsPerDoseInput(unitsPerDose);
                                                                        setFreqPerDayInput(presc?.frequencyPerDay ?? null);
                                                                        setManualQty(suggested);
                                                                    }}>
                                                                        <div className={styles.drName}>{d.name} ({d.genericName})</div>
                                                                        <div className={styles.drMeta}>{d.strength} • {d.dosageForm}</div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {selectedDrug && (
                                                    <div className={styles.selectionComparison}>
                                                        <div className={styles.comparisonGrid}>
                                                            <div className={styles.compCol}>
                                                                <span className={styles.compLabel}>Prescribed</span>
                                                                <span className={styles.compValue}>{p.medicationName}</span>
                                                                {p.drug?.strengthValue ? (
                                                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{p.drug.strength}</span>
                                                                ) : null}
                                                            </div>
                                                            <div className={styles.compCol}>
                                                                <span className={styles.compLabel}>Dispensing <span className={styles.substituteBadge}>Substitute</span></span>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span className={styles.compValue}>{selectedDrug.name} ({selectedDrug.genericName})</span>
                                                                    <button className={styles.btnChange} onClick={() => setSelectedDrug(null)}>Change</button>
                                                                </div>
                                                                <span style={{ fontSize: '11px', color: '#6b7280' }}>{selectedDrug.strength}</span>
                                                                {/* Strength difference warning and substitute quantity calculation */}
                                                                {p.drug && p.drug.strengthValue && selectedDrug.strengthValue && p.drug.strengthValue !== selectedDrug.strengthValue ? (
                                                                    <div style={{
                                                                        marginTop: '4px',
                                                                        padding: '4px 8px',
                                                                        background: '#fff7ed',
                                                                        border: '1px solid #fed7aa',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        color: '#9a3412'
                                                                    }}>
                                                                        ⚠️ Strength differs — quantity recalculated for substitute drug:
                                                                        {substituteQty != null ? (
                                                                            <span> {p.doseAmount}{p.doseUnit} ÷ {selectedDrug.strengthValue}{selectedDrug.strengthUnit ?? 'mg'} × {p.frequencyPerDay}×/day × {p.durationDays}d = <strong>{substituteQty} units</strong></span>
                                                                        ) : ' (dose data unavailable)'}
                                                                        {substituteHasFractional && (
                                                                            <span style={{ color: '#b91c1c', display: 'block', marginTop: '2px', fontWeight: 600 }}>
                                                                                ⚠ Fractional — ensure selected batch is splittable
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        <div className={styles.batchArea}>
                                                            <span className={styles.compLabel}>Select Batch <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '11px' }}>(FEFO — earliest expiry first)</span></span>
                                                            {batches.length > 0 ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                                                    {batches.map(b => {
                                                                        const isSelected = selectedBatchId === b.id;
                                                                        const expLabel = new Date(b.expiryDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                                                        return (
                                                                            <div
                                                                                key={b.id}
                                                                                onClick={() => !b.isExpired && setSelectedBatchId(b.id)}
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'space-between',
                                                                                    padding: '10px 14px',
                                                                                    borderRadius: '8px',
                                                                                    border: isSelected
                                                                                        ? '2px solid #0ea5e9'
                                                                                        : b.isExpired
                                                                                            ? '1px dashed #fca5a5'
                                                                                            : '1px solid #e5e7eb',
                                                                                    background: isSelected
                                                                                        ? '#f0f9ff'
                                                                                        : b.isExpired
                                                                                            ? '#fef2f2'
                                                                                            : '#f9fafb',
                                                                                    cursor: b.isExpired ? 'not-allowed' : 'pointer',
                                                                                    opacity: b.isExpired ? 0.75 : 1,
                                                                                    transition: 'all 0.15s',
                                                                                }}
                                                                            >
                                                                                <div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', color: b.isExpired ? '#b91c1c' : '#111827' }}>
                                                                                        {b.isExpired ? '⛔' : isSelected ? '✅' : '📦'}
                                                                                        Batch {b.batchNumber}
                                                                                        {b.isExpired && (
                                                                                            <span style={{ fontSize: '10px', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '999px', textTransform: 'uppercase' }}>
                                                                                                EXPIRED
                                                                                            </span>
                                                                                        )}
                                                                                        {!b.isExpired && !b.isSplittable && (
                                                                                            <span style={{ fontSize: '10px', fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '999px' }}>
                                                                                                🔒 Non-splittable
                                                                                            </span>
                                                                                        )}
                                                                                        {!b.isExpired && b.isSplittable && (
                                                                                            <span style={{ fontSize: '10px', fontWeight: 600, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '999px' }}>
                                                                                                ✂️ Splittable
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '12px', color: b.isExpired ? '#ef4444' : '#6b7280', marginTop: '2px' }}>
                                                                                        Exp: {expLabel} &bull; {b.quantityRemaining} units in stock
                                                                                    </div>
                                                                                    {b.isExpired && (
                                                                                        <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '4px', fontWeight: 500 }}>
                                                                                            ⚠ Cannot dispense — batch has expired. Please select a valid batch.
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                {isSelected && !b.isExpired && (
                                                                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#0ea5e9' }}>SELECTED</div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className={styles.textMuted} style={{ fontSize: '12px', marginTop: '4px' }}>
                                                                    <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                                                    No active stock batches found for this drug.
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={styles.modalFooter}>
                                                            {(() => {
                                                                const selectedBatch = batches.find(b => b.id === selectedBatchId);
                                                                const isExpiredSelected = selectedBatch?.isExpired ?? false;
                                                                const qtyToDispense = manualQty ?? substituteQty ?? p.quantity;
                                                                const hasQty = qtyToDispense > 0;
                                                                return (
                                                                    <>
                                                                        {isExpiredSelected && (
                                                                            <div className={styles.errorBanner} style={{ marginBottom: '10px' }}>
                                                                                <AlertCircle size={16} />
                                                                                ⛔ Expired batch selected — dispensing is not permitted. Please choose a valid batch above.
                                                                            </div>
                                                                        )}

                                                                        {/* Manual dose calculation inputs */}
                                                                        <div style={{
                                                                            padding: '12px 14px',
                                                                            background: '#f8fafc',
                                                                            borderRadius: '10px',
                                                                            border: '1px solid #e2e8f0',
                                                                            marginBottom: '10px'
                                                                        }}>
                                                                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                                                                Calculate Dispense Quantity
                                                                            </div>
                                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                                                                                {/* Units per dose */}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Units / Dose</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0.5"
                                                                                        step="0.5"
                                                                                        placeholder={unitsPerDoseInput != null ? String(unitsPerDoseInput) : '—'}
                                                                                        value={unitsPerDoseInput ?? ''}
                                                                                        onChange={(e) => {
                                                                                            const u = e.target.value ? parseFloat(e.target.value) : null;
                                                                                            setUnitsPerDoseInput(u);
                                                                                            const f = freqPerDayInput ?? (p.frequencyPerDay ?? 1);
                                                                                            if (u != null && f != null) {
                                                                                                setManualQty(Math.ceil(u * f * p.durationDays));
                                                                                            }
                                                                                        }}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            padding: '6px 10px',
                                                                                            borderRadius: '6px',
                                                                                            border: '1px solid #cbd5e1',
                                                                                            fontSize: '13px',
                                                                                            fontWeight: 700,
                                                                                            textAlign: 'center',
                                                                                            color: '#0ea5e9',
                                                                                            outline: 'none',
                                                                                            background: '#fff'
                                                                                        }}
                                                                                    />
                                                                                </div>

                                                                                {/* Frequency per day */}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Freq / Day</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="1"
                                                                                        max="12"
                                                                                        placeholder={freqPerDayInput != null ? String(freqPerDayInput) : String(p.frequencyPerDay ?? 1)}
                                                                                        value={freqPerDayInput ?? ''}
                                                                                        onChange={(e) => {
                                                                                            const f = e.target.value ? parseInt(e.target.value, 10) : null;
                                                                                            setFreqPerDayInput(f);
                                                                                            const u = unitsPerDoseInput;
                                                                                            if (u != null && f != null) {
                                                                                                setManualQty(Math.ceil(u * f * p.durationDays));
                                                                                            }
                                                                                        }}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            padding: '6px 10px',
                                                                                            borderRadius: '6px',
                                                                                            border: '1px solid #cbd5e1',
                                                                                            fontSize: '13px',
                                                                                            fontWeight: 700,
                                                                                            textAlign: 'center',
                                                                                            color: '#0ea5e9',
                                                                                            outline: 'none',
                                                                                            background: '#fff'
                                                                                        }}
                                                                                    />
                                                                                </div>

                                                                                {/* Duration (readonly) */}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Days</label>
                                                                                    <div style={{
                                                                                        padding: '6px 10px',
                                                                                        borderRadius: '6px',
                                                                                        border: '1px solid #e2e8f0',
                                                                                        fontSize: '13px',
                                                                                        fontWeight: 700,
                                                                                        textAlign: 'center',
                                                                                        color: '#64748b',
                                                                                        background: '#f1f5f9'
                                                                                    }}>
                                                                                        {p.durationDays}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Equals + Total */}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                                                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Total Units</label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="1"
                                                                                        placeholder={String(qtyToDispense)}
                                                                                        value={manualQty ?? ''}
                                                                                        onChange={(e) => {
                                                                                            const val = e.target.value;
                                                                                            setManualQty(val ? parseInt(val, 10) : null);
                                                                                        }}
                                                                                        style={{
                                                                                            width: '80px',
                                                                                            padding: '6px 10px',
                                                                                            borderRadius: '6px',
                                                                                            border: '1px solid #0ea5e9',
                                                                                            fontSize: '14px',
                                                                                            fontWeight: 800,
                                                                                            textAlign: 'center',
                                                                                            color: '#0ea5e9',
                                                                                            outline: 'none',
                                                                                            background: '#fff0f9'
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px' }}>
                                                                                Units × Freq × Days = Total &nbsp;|&nbsp; Override any field to recalculate
                                                                            </div>
                                                                        </div>

                                                                        {dispensingId === p.id ? (
                                                                            <button className={styles.btnPrimary} disabled>Processing...</button>
                                                                        ) : pendingDispense?.id === p.id && pendingDispense.mode === 'manual' ? (
                                                                            <div className={styles.confirmGroup}>
                                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                    <span>Dispense {qtyToDispense} units of {selectedDrug.name}?</span>
                                                                                </span>
                                                                                <button
                                                                                    className={styles.btnPrimary}
                                                                                    onClick={() => handleDispense(p.id, selectedDrug.id, selectedBatchId)}
                                                                                >
                                                                                    Yes, Dispense
                                                                                </button>
                                                                                <button
                                                                                    className={styles.btnChange}
                                                                                    onClick={() => setPendingDispense(null)}
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                className={styles.btnPrimary}
                                                                                disabled={!selectedBatchId || isExpiredSelected || !hasQty}
                                                                                title={!hasQty ? 'Enter quantity to dispense' : isExpiredSelected ? 'Cannot dispense an expired batch' : undefined}
                                                                                onClick={() => setPendingDispense({ id: p.id, mode: 'manual' })}
                                                                            >
                                                                                Dispense {qtyToDispense} units
                                                                                <ArrowRight size={16} style={{ marginLeft: '8px' }} />
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.prescFooter}>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className={styles.prescDoctor}>By {p.doctor.name}</span>
                                                    {p.status !== 'Dispensed' && (
                                                        <button
                                                            className={styles.btnDispense}
                                                            onClick={() => startManualSelection(p)}
                                                        >
                                                            Select Drug &amp; Dispense
                                                            <ArrowRight size={16} style={{ marginLeft: '8px' }} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                                })}
                                {selectedVisit.prescriptions.length === 0 && (
                                    <div className={styles.emptyTable}>No pending prescriptions for this visit.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.noSelection}>
                            <div className={styles.noSelectionInner}>
                                <Pill size={48} color="var(--primary-color)" style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                <h3>Select a Visit to Start Dispensing</h3>
                                <p>Choose a patient from the queue to process their prescribed medications and generate invoices.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
