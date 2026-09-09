'use client';
import { useEffect, useState } from 'react';
import { useTrip } from './layout';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plane, Building2, Car, Compass, Calendar, DollarSign, Shield, Users, Plus, AlertTriangle, Zap } from 'lucide-react';
import { formatCurrency, formatTime, formatDateShort, getResilienceColor, getResilienceLabel, BOOKING_TYPES } from '@/lib/utils';
import styles from './page.module.css';

const TypeIcon = ({ type, size = 16 }) => {
  const icons = { flight: Plane, hotel: Building2, transfer: Car, activity: Compass, event: Calendar, train: Plane, bus: Car };
  const Icon = icons[type] || Compass;
  return <Icon size={size} />;
};

export default function TripOverview() {
  const { trip, members, supabase } = useTrip();
  const { id } = useParams();
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: b } = await supabase.from('bookings').select('*').eq('trip_id', id).order('start_datetime', { ascending: true });
      setBookings(b || []);
      const { data: e } = await supabase.from('expenses').select('*').eq('trip_id', id);
      setExpenses(e || []);
      setLoading(false);
    };
    load();
  }, [id]);

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const atRisk = bookings.filter(b => b.risk_level === 'medium' || b.risk_level === 'high');
  const upcoming = bookings.filter(b => new Date(b.start_datetime) > new Date()).slice(0, 3);
  const score = trip?.resilience_score || 85;

  if (loading) {
    return (
      <div className="grid-4">
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
      </div>
    );
  }

  return (
    <div>
      {/* Stats Row */}
      <div className="grid-4" style={{ marginBottom: 32 }}>
        <div className="card stat-card card-flat">
          <div className="stat-label">Bookings</div>
          <div className="stat-value">{bookings.length}</div>
        </div>
        <div className="card stat-card card-flat">
          <div className="stat-label">Total Spent</div>
          <div className="stat-value">{formatCurrency(totalSpent, trip?.currency)}</div>
        </div>
        <div className="card stat-card card-flat">
          <div className="stat-label">Budget Left</div>
          <div className="stat-value">{formatCurrency(Math.max(0, (trip?.budget || 0) - totalSpent), trip?.currency)}</div>
        </div>
        <div className="card stat-card card-flat">
          <div className="stat-label">Resilience</div>
          <div className="stat-value" style={{ color: getResilienceColor(score) }}>{score}/100</div>
          <div className="stat-sub">{getResilienceLabel(score)}</div>
        </div>
      </div>

      <div className={styles.twoCol}>
        {/* Upcoming */}
        <div>
          <h3 style={{ marginBottom: 16 }}>Upcoming Bookings</h3>
          {upcoming.length === 0 ? (
            <div className="card card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-tertiary)' }}>No upcoming bookings yet.</p>
              <Link href={`/trip/${id}/itinerary`} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                <Plus size={14} /> Add Bookings
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map(b => (
                <div key={b.id} className="card card-flat" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ color: BOOKING_TYPES[b.type]?.color || 'var(--accent)' }}>
                      <TypeIcon type={b.type} size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{b.title}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                        {formatDateShort(b.start_datetime)} · {formatTime(b.start_datetime)}
                      </div>
                    </div>
                    <span className={`badge badge-${b.status === 'confirmed' ? 'success' : b.status === 'at_risk' ? 'warning' : 'danger'}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* At-Risk / Quick Actions */}
        <div>
          {atRisk.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} style={{ color: 'var(--warning)' }} /> At-Risk Bookings
              </h3>
              {atRisk.map(b => (
                <div key={b.id} className="card card-flat" style={{ padding: 16, marginBottom: 8, borderLeft: '3px solid var(--warning)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.title}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{b.risk_reason || 'Potential risk detected'}</div>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ marginBottom: 16 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/trip/${id}/itinerary`} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Plus size={16} /> Add Booking
            </Link>
            <Link href={`/trip/${id}/expenses`} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <DollarSign size={16} /> Log Expense
            </Link>
            <Link href={`/trip/${id}/disruption`} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Zap size={16} /> Disruption Center
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
