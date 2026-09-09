'use client';
import { useMemo } from 'react';
import {
  Plane,
  Building,
  Train,
  Compass,
  Car,
  HelpCircle,
  Trash2,
  Link2,
  CheckCircle2,
  ArrowDown,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import styles from './ItineraryCanvas.module.css';

const TYPE_ICONS = {
  flight: Plane,
  hotel: Building,
  train: Train,
  activity: Compass,
  transfer: Car,
  other: HelpCircle,
};

export default function ItineraryCanvas({
  bookings = [],
  dependencies = [],
  currency = 'INR',
  onRemoveBooking,
  onConfirmItinerary,
  isSubmitting = false,
}) {
  const sortedBookings = useMemo(() => {
    return [...bookings].sort(
      (a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0)
    );
  }, [bookings]);

  // Calculate estimated resilience
  const resilienceScore = useMemo(() => {
    if (bookings.length === 0) return 100;
    let score = 95;
    if (bookings.length >= 3) score = 88;
    if (dependencies.length > 2) score = 82;
    return score;
  }, [bookings, dependencies]);

  const totalCost = useMemo(() => {
    return bookings.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);
  }, [bookings]);

  if (bookings.length === 0) {
    return (
      <div className={styles.canvasContainer}>
        <div className={styles.emptyState}>
          <Calendar size={36} color="var(--color-text-muted)" />
          <p style={{ fontWeight: 500, color: 'var(--color-text)' }}>Canvas is Empty</p>
          <p style={{ fontSize: '12px' }}>
            Upload a PDF booking confirmation or speak your itinerary to see live structured bookings appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.canvasContainer}>
      <div className={styles.topBar}>
        <div>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, margin: 0 }}>
            Interactive Itinerary Canvas
          </h3>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
            Review, refine, and verify extracted bookings and transfer dependencies.
          </p>
        </div>

        <div className={styles.badgeGroup}>
          <span className={styles.itemCountBadge}>
            {bookings.length} {bookings.length === 1 ? 'Booking' : 'Bookings'}
          </span>
          <span className={styles.resilienceBadge}>
            <ShieldCheck size={14} style={{ display: 'inline', marginRight: 4 }} />
            {resilienceScore}% Resilience
          </span>
          <span className={styles.pendingBadge}>
            ⏳ Pass Check Pending
          </span>
        </div>
      </div>

      <div className={styles.passCheckNotice}>
        <div className={styles.passCheckNoticeLeft}>
          <ShieldCheck size={18} color="#D97706" />
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#92400E' }}>
              Canvas Pass Check &amp; Verification
            </span>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#B45309' }}>
              Inspect each booking node below. When the schedule is verified, click &quot;Give Pass Check &amp; Confirm Itinerary&quot;.
            </p>
          </div>
        </div>
        <div className={styles.passCheckChips}>
          <span className={styles.chip}>✓ {bookings.length} Nodes</span>
          <span className={styles.chip}>✓ {dependencies.length} Transfers</span>
        </div>
      </div>

      <div className={styles.cardList}>
        {sortedBookings.map((booking, index) => {
          const Icon = TYPE_ICONS[booking.type] || HelpCircle;
          const nextBooking = sortedBookings[index + 1];

          // Check if there is an explicit dependency to the next booking
          const dep = dependencies.find(d => {
            const isUp = d.upstream_temp_id === booking.temp_id ||
                         d.upstream_booking_id === booking.id ||
                         d.upstream_booking_id === booking.temp_id ||
                         d.upstream_temp_id === booking.id;
            const isDown = nextBooking && (
              d.downstream_temp_id === nextBooking.temp_id ||
              d.downstream_booking_id === nextBooking.id ||
              d.downstream_booking_id === nextBooking.temp_id ||
              d.downstream_temp_id === nextBooking.id
            );
            return isUp && isDown;
          });

          return (
            <div key={booking.temp_id || booking.id || index}>
              <div className={styles.bookingCard}>
                <div className={styles.cardMain}>
                  <div className={styles.typeIcon}>
                    <Icon size={20} />
                  </div>
                  <div className={styles.details}>
                    <span className={styles.cardTitle}>{booking.title}</span>
                    <div className={styles.cardMeta}>
                      <span>
                        {formatDate(booking.start_datetime)}
                        {booking.start_datetime && booking.start_datetime.includes('T') && (
                          <> at {booking.start_datetime.split('T')[1].slice(0, 5)}</>
                        )}
                      </span>
                      {booking.vendor && <span>Vendor: {booking.vendor}</span>}
                      {booking.confirmation_number && (
                        <span>Ref: {booking.confirmation_number}</span>
                      )}
                    </div>
                    {booking.cancellation_policy && (
                      <span className={styles.cardExtra}>
                        Policy: {booking.cancellation_policy}
                      </span>
                    )}
                    {booking.risk_reason && booking.risk_reason.includes('[RECOVERED_PLAN]:') && (
                      <div style={{ marginTop: 8, padding: '6px 8px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, fontSize: '11px', color: '#92400E' }}>
                        <span style={{ fontWeight: 700 }}>⚡ Disruption Recovery Applied</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.cardRight}>
                  <span className={styles.costTag}>
                    {formatCurrency(booking.cost || 0, currency)}
                  </span>
                  {onRemoveBooking && (
                    <button
                      type="button"
                      onClick={() => onRemoveBooking(booking.temp_id || booking.id)}
                      className="btn-ghost"
                      style={{ padding: '4px', color: 'var(--color-danger)' }}
                      title="Remove booking"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {nextBooking && (
                <div className={styles.dependencyLine}>
                  <ArrowDown size={14} />
                  <Link2 size={12} color="var(--color-primary)" />
                  <span>
                    {dep ? `${dep.buffer_minutes || 90}m transition buffer` : 'Sequential connection'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.bottomAction}>
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Total Itinerary Value:
          </span>{' '}
          <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
            {formatCurrency(totalCost, currency)}
          </strong>
        </div>

        <button
          type="button"
          onClick={onConfirmItinerary}
          disabled={isSubmitting || bookings.length === 0}
          className="btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#059669',
            borderColor: '#059669',
            color: '#FFFFFF',
            padding: '10px 20px',
            fontWeight: 600
          }}
        >
          <CheckCircle2 size={18} />
          <span>{isSubmitting ? 'Verifying & Saving...' : '✓ Give Pass Check & Confirm Itinerary'}</span>
        </button>
      </div>
    </div>
  );
}
