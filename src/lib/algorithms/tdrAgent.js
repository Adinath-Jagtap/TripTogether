/**
 * TDR Autopilot — Eligibility Evaluator
 *
 * Indian Railways TDR (Ticket Deposit Receipt) Rule:
 *   A full refund can only be claimed if the train is delayed by MORE THAN 3 hours
 *   AND the TDR is filed BEFORE the train's actual departure from the origin station.
 *   Once the train departs (even if late), the window is permanently closed.
 *
 * This module is purely deterministic — no LLM calls, no network I/O.
 * It receives a booking and a live-status object and returns an eligibility verdict.
 *
 * NOTE: This feature detects eligibility and alerts the traveler for a one-tap
 * handoff to irctc.co.in. We do NOT attempt to file TDR on the user's behalf.
 * There is no public IRCTC API for autonomous TDR filing; it requires the user's
 * own logged-in IRCTC session. This is intentional, not incomplete.
 */

/**
 * Evaluate whether a train booking is currently eligible for a TDR refund.
 *
 * @param {Object} booking        - Firestore booking document
 *   @param {string} booking.type            - must be 'train'
 *   @param {string} booking.pnr             - PNR number (e.g. "2345678901")
 *   @param {number} booking.cost            - ticket cost in trip currency (used as refundAmount)
 *   @param {string} booking.start_datetime  - ISO-8601 scheduled departure
 * @param {Object} liveStatus     - live train status object (from tracking API or mock)
 *   @param {boolean} liveStatus.hasDeparted   - true if the train has actually left origin
 *   @param {number}  liveStatus.delayMinutes  - current delay in minutes (0 if on time)
 *
 * @returns {null | {
 *   eligible: true,
 *   pnr: string,
 *   refundAmount: number,
 *   minutesRemaining: number,   // minutes until scheduled departure (the deadline)
 *   delayMinutes: number,
 *   scheduledDeparture: string, // ISO-8601
 * }}
 */
export function evaluateTDREligibility(booking, liveStatus) {
  // Guard 1: Only applies to train bookings
  if (!booking || booking.type !== 'train') return null;

  // Guard 2: If the train has already departed, the TDR window is permanently closed
  if (liveStatus.hasDeparted === true) return null;

  // Guard 3: Indian Railways TDR rule — delay must exceed 3 hours (180 minutes)
  const delayMinutes = Number(liveStatus.delayMinutes) || 0;
  if (delayMinutes < 180) return null;

  // Guard 4: We need a valid departure time to compute the deadline
  const scheduledDeparture = booking.start_datetime || booking.departure_time;
  if (!scheduledDeparture) return null;

  const departureMs = new Date(scheduledDeparture).getTime();
  if (isNaN(departureMs)) return null;

  const nowMs = Date.now();

  // Guard 5: If the scheduled departure has already passed (train may still be at station
  // but our scheduled time has elapsed) treat as window-closed to be conservative.
  // The `hasDeparted` flag from live tracking is the authoritative signal, but if we have
  // no live signal and the time has passed, err on the side of safety.
  const minutesRemaining = Math.round((departureMs - nowMs) / 60000);
  if (minutesRemaining <= 0) return null;

  return {
    eligible: true,
    pnr: booking.pnr || booking.confirmation_number || null,
    refundAmount: Number(booking.cost) || 0,
    minutesRemaining,
    delayMinutes,
    scheduledDeparture,
  };
}

/**
 * Determine the escalation channel purely from minutesRemaining.
 * No LLM call needed — this is a deterministic urgency ladder.
 *
 * @param {number} minutesRemaining
 * @returns {'push' | 'sms' | 'call'}
 */
export function getTDREscalationChannel(minutesRemaining) {
  if (minutesRemaining < 15) return 'call';
  if (minutesRemaining < 60) return 'sms';
  return 'push';
}

/**
 * Human-readable urgency label for UI rendering.
 *
 * @param {number} minutesRemaining
 * @returns {{ label: string, color: string, bg: string, border: string }}
 */
export function getTDRUrgencyStyle(minutesRemaining) {
  if (minutesRemaining < 15) {
    return { label: '🔴 CRITICAL', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' };
  }
  if (minutesRemaining < 60) {
    return { label: '🟠 URGENT', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' };
  }
  return { label: '⚠️ ACT NOW', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' };
}
