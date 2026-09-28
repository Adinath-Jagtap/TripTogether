/**
 * Cascade Impact Detector
 * 
 * Given a disrupted booking, performs a topological traversal of the
 * booking dependency DAG to find all downstream affected bookings
 * and calculate accumulated delay impact.
 */

/**
 * @param {string} disruptedBookingId
 * @param {Array} dependencies - booking_dependencies rows
 * @param {Array} bookings - all bookings for this trip
 * @param {number} delayMinutes - disruption delay in minutes
 * @returns {Array} affected bookings with impact details
 */
export function detectCascade(disruptedBookingId, dependencies, bookings, delayMinutes) {
  const bookingMap = new Map(bookings.map(b => [b.id, { ...b }]));

  // Build adjacency list: upstreamId → [{ bookingId, bufferMinutes, type }]
  const downstream = new Map();
  for (const dep of dependencies) {
    if (!downstream.has(dep.upstream_booking_id)) {
      downstream.set(dep.upstream_booking_id, []);
    }
    downstream.get(dep.upstream_booking_id).push({
      bookingId: dep.downstream_booking_id,
      bufferMinutes: dep.buffer_minutes || 60,
      type: dep.dependency_type,
    });
  }

  const affected = [];
  const visited = new Set();
  const queue = [{ bookingId: disruptedBookingId, accumulatedDelay: delayMinutes }];

  while (queue.length > 0) {
    const { bookingId, accumulatedDelay } = queue.shift();
    if (visited.has(bookingId)) continue;
    visited.add(bookingId);

    const booking = bookingMap.get(bookingId);
    if (!booking) continue;

    if (bookingId !== disruptedBookingId) {
      affected.push({
        booking_id: bookingId,
        booking,
        accumulated_delay: accumulatedDelay,
        impact_type: getImpactType(accumulatedDelay),
        impact_description: generateImpactDescription(booking, accumulatedDelay),
      });
    }

    // Propagate to downstream bookings
    const children = downstream.get(bookingId) || [];
    for (const child of children) {
      const newDelay = Math.max(0, accumulatedDelay - child.bufferMinutes);
      if (newDelay > 0) {
        queue.push({ bookingId: child.bookingId, accumulatedDelay: newDelay });
      }
    }
  }

  return affected;
}

function getImpactType(delayMinutes) {
  if (delayMinutes > 120) return 'missed';
  if (delayMinutes > 60) return 'at_risk';
  return 'tight';
}

function generateImpactDescription(booking, delayMinutes) {
  const hours = Math.floor(delayMinutes / 60);
  const mins = delayMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  switch (booking.type) {
    case 'hotel':
      return `Check-in delayed by ${timeStr}`;
    case 'transfer':
      return `Transfer invalid — ${timeStr} late`;
    case 'flight':
      return `May miss connecting flight by ${timeStr}`;
    case 'activity':
      return `Activity start delayed by ${timeStr}`;
    case 'event':
      return `Event start missed by ${timeStr}`;
    default:
      return `Delayed by ${timeStr}`;
  }
}

/**
 * Calculate a resilience score for a trip based on bookings and their risks.
 * @param {Array} bookings
 * @param {Array} dependencies
 * @returns {number} 0-100
 */
export function calculateResilienceScore(bookings, dependencies) {
  if (!bookings || bookings.length === 0) return 85;

  let score = 100;

  // Deduct for disrupted/cancelled bookings
  const disrupted = bookings.filter(b => b.status === 'disrupted' || b.status === 'cancelled');
  score -= disrupted.length * 15;

  // Deduct for at-risk bookings
  const atRisk = bookings.filter(b => b.risk_level === 'high');
  score -= atRisk.length * 8;
  const mediumRisk = bookings.filter(b => b.risk_level === 'medium');
  score -= mediumRisk.length * 4;

  // Deduct for tight connections (< 45 min buffer in dependencies)
  const tightConnections = dependencies.filter(d => d.buffer_minutes < 45);
  score -= tightConnections.length * 5;

  return Math.max(0, Math.min(100, score));
}
