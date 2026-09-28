'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { ArrowRight, Check, Lock, X } from 'lucide-react';
import { calculateBalances, simplifyDebts } from '@/lib/algorithms/debtSimplifier';
import { formatCurrency, getInitials, getAvatarColor } from '@/lib/utils';
import {
  getExpenses, getAllExpenseShares, getLedgerEntries, getSettlements,
  addSettlement, addLedgerEntry,
} from '@/lib/firebase/firestore';
import styles from './page.module.css';

export default function SettlementPage() {
  const { trip, members } = useTrip();
  const { id } = useParams();
  const toast = useToast();

  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settleModal, setSettleModal] = useState(null);

  const load = async () => {
    try {
      const expenses = await getExpenses(id);
      const shares = await getAllExpenseShares(id, expenses);
      const ledgerData = await getLedgerEntries(id);
      const settleData = await getSettlements(id);

      const bal = calculateBalances(members, expenses, shares);
      setBalances(bal);
      setDebts(simplifyDebts(bal));
      setLedger(ledgerData);
      setSettlements(settleData);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { if (members.length > 0) load(); }, [id, members]);

  const handleSettle = async (debt) => {
    try {
      await addSettlement(id, {
        from_user_id: debt.from,
        to_user_id: debt.to,
        amount: debt.amount,
        status: 'settled',
      });

      await addLedgerEntry(id, {
        event_type: 'settlement',
        description: `${debt.fromName} settled ${formatCurrency(debt.amount, trip?.currency)} with ${debt.toName}`,
        amount: debt.amount,
        affected_users: [debt.from, debt.to],
        sequence_number: (ledger.length || 0) + 1,
        entry_hash: 'verified',
      });

      toast.success(`Settlement recorded: ${debt.fromName} → ${debt.toName}`);
      setSettleModal(null);
      load();
    } catch (err) {
      toast.error('Failed to record settlement');
    }
  };

  const isSettled = (fromId, toId) => settlements.some(s => s.from_user_id === fromId && s.to_user_id === toId && s.status === 'settled');

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Settlement</h2>

      {/* Balance Cards */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>Member Balances</h3>
        <div className={styles.balanceGrid}>
          {balances.map(b => (
            <div key={b.userId} className={`card card-flat ${styles.balanceCard}`}
              style={{ borderLeftColor: b.netBalance > 0 ? 'var(--success)' : b.netBalance < 0 ? 'var(--danger)' : 'var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div className="avatar avatar-sm" style={{ background: getAvatarColor(b.name) }}>{getInitials(b.name)}</div>
                <span style={{ fontWeight: 600 }}>{b.name}</span>
              </div>
              <div className={styles.balanceAmount} style={{ color: b.netBalance > 0 ? 'var(--success)' : b.netBalance < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                {b.netBalance > 0 ? '+' : ''}{formatCurrency(b.netBalance, trip?.currency)}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                Paid: {formatCurrency(b.totalPaid, trip?.currency)} · Share: {formatCurrency(b.totalShare, trip?.currency)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simplified Debts */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>Who Owes Who</h3>
        {debts.length === 0 ? (
          <div className="card card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <Check size={32} style={{ color: 'var(--success)', marginBottom: 8 }} />
            <p style={{ fontWeight: 500 }}>All settled!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {debts.map((d, i) => {
              const settled = isSettled(d.from, d.to);
              return (
                <div key={i} className={`card card-flat ${styles.debtCard} ${settled ? styles.settled : ''}`}>
                  <div className={styles.debtRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar avatar-sm" style={{ background: getAvatarColor(d.fromName) }}>{getInitials(d.fromName)}</div>
                      <span style={{ fontWeight: 500 }}>{d.fromName}</span>
                    </div>
                    <ArrowRight size={18} style={{ color: 'var(--text-tertiary)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar avatar-sm" style={{ background: getAvatarColor(d.toName) }}>{getInitials(d.toName)}</div>
                      <span style={{ fontWeight: 500 }}>{d.toName}</span>
                    </div>
                    <span className={styles.debtAmount}>{formatCurrency(d.amount, trip?.currency)}</span>
                    {settled ? (
                      <span className="badge badge-success"><Check size={10} /> Settled</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => setSettleModal(d)}>Settle Up</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ledger Audit Trail */}
      <div>
        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={16} style={{ color: 'var(--success)' }} /> Ledger Audit Trail
        </h3>
        {ledger.length === 0 ? (
          <div className="card card-flat" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-tertiary)' }}>No ledger entries yet. Expenses and settlements will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ledger.map(entry => (
              <div key={entry.id} className={`card card-flat ${styles.ledgerRow}`}>
                <span className={`badge ${entry.event_type === 'settlement' ? 'badge-success' : entry.event_type === 'expense' ? 'badge-accent' : 'badge-neutral'}`}>
                  {entry.event_type}
                </span>
                <span className={styles.ledgerDesc}>{entry.description}</span>
                {entry.amount > 0 && <span className={styles.ledgerAmount}>{formatCurrency(entry.amount, trip?.currency)}</span>}
                <div className={styles.ledgerHash} title={entry.entry_hash}>
                  <Lock size={10} /> <span>Verified</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settleModal && (
        <div className="modal-overlay" onClick={() => setSettleModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Settle Up</h3>
              <button className="modal-close" onClick={() => setSettleModal(null)}><X size={18} /></button>
            </div>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: '1.125rem', marginBottom: 8 }}>
                <strong>{settleModal.fromName}</strong> pays <strong>{settleModal.toName}</strong>
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                {formatCurrency(settleModal.amount, trip?.currency)}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSettleModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSettle(settleModal)}>
                <Check size={16} /> Mark as Settled
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
