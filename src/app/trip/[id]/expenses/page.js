'use client';
import { useEffect, useState, useCallback } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { Plus, X, DollarSign, Search, Car, Building2, UtensilsCrossed, Compass, ShoppingBag, AlertCircle, MoreHorizontal, Trash2, Percent, Receipt } from 'lucide-react';
import { formatCurrency, EXPENSE_CATEGORIES, getInitials, getAvatarColor } from '@/lib/utils';
import { calculateShares } from '@/lib/algorithms/debtSimplifier';
import { getExpenses, addExpense, deleteExpense, addExpenseShare } from '@/lib/firebase/firestore';
import styles from './page.module.css';

const CatIcons = { transport: Car, accommodation: Building2, food: UtensilsCrossed, activity: Compass, shopping: ShoppingBag, emergency: AlertCircle, other: MoreHorizontal };

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];
const MAX_SLIDER = 10000;

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

  // Slider fill percentage
  const sliderFill = form.amount ? Math.min(100, (Number(form.amount) / MAX_SLIDER) * 100) : 0;

  if (loading) return <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />;

  return (
    <div>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2>Expenses</h2>
          <p className={styles.subtext}>{formatCurrency(totalSpent, trip?.currency)} spent of {formatCurrency(trip?.budget, trip?.currency)}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAddModal}><Plus size={16} /> Add</button>
      </div>

      {/* Budget Progress */}
      <div style={{ marginBottom: 24 }}>
        <div className="progress-bar">
          <div className={`progress-fill ${budgetPct >= 100 ? 'progress-over' : budgetPct >= 80 ? 'progress-warning' : 'progress-ok'}`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div className={styles.progressMeta}>
          <span>{budgetPct}% used</span>
          <span>{formatCurrency(Math.max(0, (trip?.budget || 0) - totalSpent), trip?.currency)} remaining</span>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(catBreakdown).length > 0 && (
        <div className={styles.catGrid}>
          {Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
            const Icon = CatIcons[cat] || MoreHorizontal;
            return (
              <div key={cat} className={styles.catCard}>
                <div className={styles.catIconWrap}><Icon size={16} /></div>
                <div>
                  <div className={styles.catLabel}>{EXPENSE_CATEGORIES[cat]?.label || cat}</div>
                  <div className={styles.catAmount}>{formatCurrency(amt, trip?.currency)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input className="form-input" placeholder="Search expenses..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 36, fontSize: '0.875rem' }} />
        </div>
        <select className="form-input form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 'auto', minWidth: 120, fontSize: '0.875rem' }}>
          <option value="all">All</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <div className="empty-state-icon"><Receipt size={40} /></div>
          <h3>No expenses yet</h3>
          <p>Start logging expenses to track your group spending.</p>
        </div>
      ) : (
        <div className={styles.expenseList}>
          {filtered.map(exp => {
            const Icon = CatIcons[exp.category] || MoreHorizontal;
            return (
              <div key={exp.id} className={styles.expenseRow}>
                <div className={styles.expIcon}><Icon size={18} /></div>
                <div className={styles.expInfo}>
                  <div className={styles.expTitle}>{exp.title}</div>
                  <div className={styles.expMeta}>{getMemberName(exp.paid_by)} · {exp.date}</div>
                </div>
                <div className={styles.expRight}>
                  <div className={styles.expAmount}>{formatCurrency(exp.amount, trip?.currency)}</div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(exp.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Expense Bottom Sheet Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Expense</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {/* Compact Amount & Slider Section */}
              <div style={{ padding: '10px 12px', background: '#FAF9F6', borderRadius: 12, border: '1px solid #EBE7E0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent)' }}>
                    {trip?.currency === 'USD' ? '$' : trip?.currency === 'EUR' ? '€' : '₹'}
                  </span>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => updateForm('amount', e.target.value)}
                    placeholder="0"
                    style={{
                      fontSize: '1.375rem',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      width: 130,
                      textAlign: 'center',
                      border: 'none',
                      background: 'transparent',
                      borderBottom: '2px solid var(--accent)',
                      borderRadius: 0,
                      outline: 'none',
                      padding: '2px 0',
                    }}
                  />
                </div>

                <input
                  type="range"
                  className="amount-range"
                  min="0"
                  max={MAX_SLIDER}
                  step="50"
                  value={Number(form.amount) || 0}
                  onChange={e => updateForm('amount', e.target.value)}
                  style={{ '--fill': `${sliderFill}%`, width: '100%' }}
                />

                <div className="amount-chips" style={{ marginTop: 6, gap: 4 }}>
                  {QUICK_AMOUNTS.map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className={`amount-chip ${Number(form.amount) === amt ? 'selected' : ''}`}
                      onClick={() => updateForm('amount', String(amt))}
                      style={{ padding: '2px 8px', fontSize: '0.6875rem' }}
                    >
                      {amt >= 1000 ? `${amt / 1000}K` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title & Date Row */}
              <div className={styles.formRow} style={{ gap: 10, marginBottom: 0 }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>What was it for? *</label>
                  <input className="form-input" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="Dinner, Taxi, Tickets..." style={{ fontSize: '0.8125rem', padding: '6px 10px' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>Date</label>
                  <input type="date" className="form-input" value={form.date} onChange={e => updateForm('date', e.target.value)} style={{ fontSize: '0.8125rem', padding: '6px 6px' }} />
                </div>
              </div>

              {/* Category Chips Horizontal Scroll */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>Category</label>
                <div className="category-chips" style={{ display: 'flex', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2, gap: 5, scrollbarWidth: 'none' }}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => {
                    const CatIcon = CatIcons[k] || MoreHorizontal;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`category-chip ${form.category === k ? 'selected' : ''}`}
                        onClick={() => updateForm('category', k)}
                        style={{ padding: '4px 8px', fontSize: '0.75rem', flexShrink: 0 }}
                      >
                        <CatIcon size={12} />
                        <span>{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paid By & Split Type Row */}
              <div className={styles.formRow} style={{ gap: 10, marginBottom: 0 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>Paid By</label>
                  <select className="form-input form-select" value={form.paid_by} onChange={e => updateForm('paid_by', e.target.value)} style={{ fontSize: '0.8125rem', padding: '6px 8px' }}>
                    <option value="">Select...</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 2 }}>Split Type</label>
                  <select className="form-input form-select" value={form.split_type} onChange={e => updateForm('split_type', e.target.value)} style={{ fontSize: '0.8125rem', padding: '6px 8px' }}>
                    <option value="equal">Equal</option>
                    <option value="percentage">Percentage</option>
                    <option value="custom">Custom</option>
                    <option value="full">Full (no split)</option>
                  </select>
                </div>
              </div>

              {/* Equal Split Participants */}
              {form.split_type === 'equal' && (
                <div className={styles.participantSection} style={{ padding: '6px 8px', marginTop: 0 }}>
                  <div className={styles.participantHeader} style={{ fontSize: '0.6875rem', marginBottom: 2 }}>
                    <span>Included ({form.participants?.length || members.length})</span>
                    <span className={styles.perPerson}>
                      {formatCurrency((form.participants?.length || members.length) > 0 ? ((Number(form.amount) || 0) / (form.participants?.length || members.length)).toFixed(2) : 0, trip?.currency)} each
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {members.map(m => {
                      const currentParticipants = form.participants?.length > 0 ? form.participants : members.map(mem => mem.id);
                      const isSelected = currentParticipants.includes(m.id);
                      return (
                        <button key={m.id} type="button"
                          onClick={() => {
                            const next = isSelected ? (currentParticipants.length > 1 ? currentParticipants.filter(p => p !== m.id) : currentParticipants) : [...currentParticipants, m.id];
                            updateForm('participants', next);
                          }}
                          className={`${styles.participantChip} ${isSelected ? styles.participantSelected : ''}`}
                          style={{ padding: '2px 6px', fontSize: '0.6875rem' }}
                        >
                          <span>{isSelected ? '✓' : '+'}</span>
                          <span>{m.full_name?.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
