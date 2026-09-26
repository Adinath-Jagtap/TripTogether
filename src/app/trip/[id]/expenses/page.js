'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { Plus, X, DollarSign, Search, Car, Building2, UtensilsCrossed, Compass, ShoppingBag, AlertCircle, MoreHorizontal, Trash2, Percent } from 'lucide-react';
import { formatCurrency, EXPENSE_CATEGORIES, getInitials, getAvatarColor } from '@/lib/utils';
import { calculateShares } from '@/lib/algorithms/debtSimplifier';
import { getExpenses, addExpense, deleteExpense, addExpenseShare } from '@/lib/firebase/firestore';
import styles from './page.module.css';

const CatIcons = { transport: Car, accommodation: Building2, food: UtensilsCrossed, activity: Compass, shopping: ShoppingBag, emergency: AlertCircle, other: MoreHorizontal };

export default function ExpensesPage() {
  const { trip, members, user } = useTrip();
  const { id } = useParams();
  const toast = useToast();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  const [form, setForm] = useState({
    title: '', amount: '', category: 'food', paid_by: '',
    split_type: 'equal', date: new Date().toISOString().split('T')[0], notes: '',
    participants: [],
  });
  const [customSplits, setCustomSplits] = useState({});

  const load = async () => {
    try {
      const data = await getExpenses(id);
      setExpenses(data || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (members.length > 0 && !form.paid_by) {
      const defaultUser = members.find(m => m.id === (user?.uid || user?.id)) || members[0];
      if (defaultUser) setForm(p => ({ ...p, paid_by: defaultUser.id }));
    }
  }, [members, user]);

  const updateForm = (k, v) => {
    setForm(p => {
      const updated = { ...p, [k]: v };
      if (k === 'split_type') splitEvenly(v, updated.amount, updated.participants);
      else if (k === 'amount' && updated.split_type === 'custom') splitEvenly('custom', v, updated.participants);
      return updated;
    });
  };

  const splitEvenly = (type = form.split_type, amt = form.amount, currentParts = form.participants) => {
    const activeParticipants = currentParts && currentParts.length > 0 ? currentParts : members.map(m => m.id);
    const count = activeParticipants.length;
    if (count === 0) return;
    if (type === 'percentage') {
      const basePct = Math.floor(100 / count);
      const remainder = 100 - basePct * count;
      const newSplits = {};
      activeParticipants.forEach((uid, idx) => { newSplits[uid] = idx === count - 1 ? (basePct + remainder).toString() : basePct.toString(); });
      setCustomSplits(newSplits);
    } else if (type === 'custom') {
      const numAmount = Number(amt) || 0;
      const baseAmt = Math.floor((numAmount / count) * 100) / 100;
      const remainder = Math.round((numAmount - baseAmt * count) * 100) / 100;
      const newSplits = {};
      activeParticipants.forEach((uid, idx) => { newSplits[uid] = idx === count - 1 ? (baseAmt + remainder).toFixed(2) : baseAmt.toFixed(2); });
      setCustomSplits(newSplits);
    }
  };

  const openAddModal = () => {
    const defaultUser = members.find(m => m.id === (user?.uid || user?.id)) || members[0];
    setForm({ title: '', amount: '', category: 'food', paid_by: defaultUser?.id || '', split_type: 'equal', date: new Date().toISOString().split('T')[0], notes: '', participants: members.map(m => m.id) });
    setCustomSplits({});
    setShowModal(true);
  };

  const handleAdd = async () => {
    if (!form.title || !form.amount || !form.paid_by) { toast.error('Title, amount, and payer are required'); return; }
    const numAmount = Number(form.amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast.error('Please enter a valid expense amount'); return; }

    const participants = form.participants.length > 0 ? form.participants : members.map(m => m.id);

    if (form.split_type === 'percentage') {
      const sumPct = participants.reduce((acc, uid) => acc + (parseFloat(customSplits[uid]) || 0), 0);
      if (Math.abs(sumPct - 100) > 0.5) { toast.error(`Percentages must add up to 100% (currently ${sumPct.toFixed(1)}%)`); return; }
    } else if (form.split_type === 'custom') {
      const sumAmt = participants.reduce((acc, uid) => acc + (parseFloat(customSplits[uid]) || 0), 0);
      if (Math.abs(sumAmt - numAmount) > 1) { toast.error(`Custom amounts must equal total expense`); return; }
    }

    const customSplitsArray = participants.map(uid => ({ userId: uid, value: parseFloat(customSplits[uid]) || 0 }));
    const shares = calculateShares(numAmount, participants.map(uid => ({ userId: uid })), form.split_type, customSplitsArray, form.paid_by);

    try {
      const expenseData = {
        trip_id: id,
        title: form.title,
        amount: numAmount,
        category: form.category,
        paid_by: form.paid_by,
        split_type: form.split_type === 'custom' ? 'exact' : form.split_type,
        date: form.date,
        notes: form.notes || null,
      };
      const saved = await addExpense(id, expenseData);

      // Insert shares
      for (const s of shares) {
        try {
          await addExpenseShare(id, saved.id, { user_id: s.userId, share_amount: s.shareAmount, expense_id: saved.id });
        } catch (_) {}
      }

      toast.success('Expense added!');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to record expense');
    }
  };

  const handleDelete = async (expId) => {
    if (!confirm('Delete this expense?')) return;
    try { await deleteExpense(id, expId); } catch (_) {}
    toast.success('Expense deleted');
    load();
  };

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const budgetPct = trip?.budget ? Math.min(100, Math.round((totalSpent / trip.budget) * 100)) : 0;
  const filtered = expenses.filter(e => {
    if (filterCat !== 'all' && e.category !== filterCat) return false;
    if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const getMemberName = (uid) => members.find(m => m.id === uid)?.full_name || 'Unknown';
  const catBreakdown = {};
  for (const e of expenses) catBreakdown[e.category] = (catBreakdown[e.category] || 0) + Number(e.amount);

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2>Expenses</h2>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>{formatCurrency(totalSpent, trip?.currency)} spent of {formatCurrency(trip?.budget, trip?.currency)}</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}><Plus size={16} /> Add Expense</button>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div className="progress-bar">
          <div className={`progress-fill ${budgetPct >= 100 ? 'progress-over' : budgetPct >= 80 ? 'progress-warning' : 'progress-ok'}`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
          <span>{budgetPct}% used</span>
          <span>{formatCurrency(Math.max(0, (trip?.budget || 0) - totalSpent), trip?.currency)} remaining</span>
        </div>
      </div>

      {Object.keys(catBreakdown).length > 0 && (
        <div className={styles.catGrid}>
          {Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
            const Icon = CatIcons[cat] || MoreHorizontal;
            return (
              <div key={cat} className={`card card-flat ${styles.catCard}`}>
                <Icon size={18} style={{ color: 'var(--accent)' }} />
                <div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{EXPENSE_CATEGORIES[cat]?.label || cat}</div>
                  <div style={{ fontWeight: 600 }}>{formatCurrency(amt, trip?.currency)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input className="form-input" placeholder="Search expenses..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <select className="form-input form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 160 }}>
          <option value="all">All Categories</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><DollarSign size={48} /></div>
          <h3>No expenses yet</h3>
          <p>Start logging expenses to track your group spending.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(exp => {
            const Icon = CatIcons[exp.category] || MoreHorizontal;
            return (
              <div key={exp.id} className={`card card-flat ${styles.expenseRow}`}>
                <div className={styles.expIcon}><Icon size={18} /></div>
                <div className={styles.expInfo}>
                  <div className={styles.expTitle}>{exp.title}</div>
                  <div className={styles.expMeta}>Paid by {getMemberName(exp.paid_by)} · {exp.date} · <span className="badge badge-neutral">{exp.split_type}</span></div>
                </div>
                <div className={styles.expAmount}>{formatCurrency(exp.amount, trip?.currency)}</div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(exp.id)}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Expense</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="Dinner at Fisherman's Cove" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Amount *</label>
                  <input type="number" className="form-input" value={form.amount} onChange={e => updateForm('amount', e.target.value)} placeholder="2400" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Category</label>
                  <select className="form-input form-select" value={form.category} onChange={e => updateForm('category', e.target.value)}>
                    {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Paid By *</label>
                  <select className="form-input form-select" value={form.paid_by} onChange={e => updateForm('paid_by', e.target.value)}>
                    <option value="">Select member...</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Split Type</label>
                  <select className="form-input form-select" value={form.split_type} onChange={e => updateForm('split_type', e.target.value)}>
                    <option value="equal">Equal</option>
                    <option value="percentage">Percentage</option>
                    <option value="custom">Custom</option>
                    <option value="full">Full (no split)</option>
                  </select>
                </div>
              </div>

              {form.split_type === 'equal' && (
                <div style={{ background: '#FAF8F5', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-default, #E5E0D8)', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Included ({form.participants?.length || members.length}):</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {formatCurrency((form.participants?.length || members.length) > 0 ? ((Number(form.amount) || 0) / (form.participants?.length || members.length)).toFixed(2) : 0, trip?.currency)} / person
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {members.map(m => {
                      const currentParticipants = form.participants?.length > 0 ? form.participants : members.map(mem => mem.id);
                      const isSelected = currentParticipants.includes(m.id);
                      return (
                        <button key={m.id} type="button"
                          onClick={() => {
                            const next = isSelected ? (currentParticipants.length > 1 ? currentParticipants.filter(p => p !== m.id) : currentParticipants) : [...currentParticipants, m.id];
                            updateForm('participants', next);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-default)', background: isSelected ? '#FEF3C7' : '#FFFFFF', color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer' }}
                        >
                          <span>{isSelected ? '✓' : '+'}</span><span>{m.full_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={form.date} onChange={e => updateForm('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-input form-textarea" value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder="Optional notes..." rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
