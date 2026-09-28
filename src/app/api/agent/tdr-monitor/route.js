import { NextResponse } from 'next/server';
import { generateEntryHash } from '@/lib/algorithms/hashChain';
import { evaluateTDREligibility, getTDREscalationChannel } from '@/lib/algorithms/tdrAgent';

/**
 * TDR Autopilot Monitor — Cron Route
 *
 * Called every 2 minutes by Vercel Cron (see vercel.json).
 * Scans all train bookings departing in the next 24 hours, checks live delay,
 * and fires escalating alerts if TDR eligibility is detected.
 *
 * Escalation ladder (deterministic, no LLM):
 *   minutesRemaining > 60  → push notification
 *   15–60 min             → SMS (stubbed — TODO: wire real SMS provider)
 *   < 15 min              → VoIP call via Vapi (stubbed — TODO: wire Vapi call-initiate)
 *
 * NOTE: We do NOT file TDR on behalf of the user. There is no public IRCTC API for
 * autonomous filing; it requires the user's own logged-in session on irctc.co.in.
 * This route only detects + alerts + logs. Autonomous filing is intentionally out of scope.
 */

// ─── MOCK LIVE STATUS ────────────────────────────────────────────────────────
// TODO: Replace this with a real Indian Railways tracking API call.
// Candidates: RailwayAPI.in, RapidAPI Train PNR Status, or NTES scraping.
// The real function signature should remain:
//   async function fetchLiveTrainStatus(pnr: string, trainNumber: string):
//     Promise<{ hasDeparted: boolean, delayMinutes: number, currentStation: string }>
async function fetchLiveTrainStatus(pnr, trainNumber) {
  // Simulated: randomly produce a delayed train ~30% of the time for demo purposes.
  // In production, replace this entire function body with real API call.
  const seed = (pnr || trainNumber || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pseudoRandom = ((seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  if (pseudoRandom > 0.7) {
    return {
      hasDeparted: false,
      delayMinutes: 185 + Math.round(pseudoRandom * 120), // 185–305 minute delay
      currentStation: 'ORIGIN',
    };
  }
  return {
    hasDeparted: false,
    delayMinutes: 0,
    currentStation: 'ORIGIN',
  };
}

// ─── STUB ALERT CHANNELS ─────────────────────────────────────────────────────

/**
 * TODO: Wire this to Firebase Cloud Messaging or web push.
 */
async function sendPushNotification({ userId, tripId, bookingId, message }) {
  console.log(`[TDR Autopilot] PUSH → userId=${userId} | ${message}`);
  // TODO: call FCM sendMulticast / web push here
}

/**
 * TODO: Wire this to Twilio, MSG91, or another SMS provider.
 * Function signature is intentional — do not change it when implementing.
 *
 * @param {Object} params
 * @param {string} params.phone   - E.164 format, e.g. "+919876543210"
 * @param {string} params.message - SMS body text
 */
async function sendSMS({ phone, message }) {
  console.log(`[TDR Autopilot] SMS → ${phone} | ${message}`);
  // TODO: replace with real SMS API call
  // Example for MSG91:
  //   await fetch('https://api.msg91.com/api/v5/flow/', {
  //     method: 'POST',
  //     headers: { 'authkey': process.env.MSG91_KEY, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ flow_id: 'YOUR_FLOW', mobiles: phone, message })
  //   });
}

/**
 * TODO: Wire to existing Vapi call-initiate route in this codebase.
 * See: src/app/api/ai/call-initiate/route.js for the existing VoIP pattern.
 *
 * @param {Object} params
 * @param {string} params.phone        - traveler's phone number
 * @param {string} params.pnr          - train PNR
 * @param {number} params.minutesLeft  - urgency context
 * @param {number} params.refundAmount - refund amount for voice script
 */
async function initiateUrgentVapiCall({ phone, pnr, minutesLeft, refundAmount }) {
  console.log(`[TDR Autopilot] VAPI CALL → ${phone} | PNR ${pnr} | ${minutesLeft}min left | ₹${refundAmount} at stake`);
  // TODO: call /api/ai/call-initiate with a TDR-specific script:
  //   await fetch('/api/ai/call-initiate', {
  //     method: 'POST',
  //     body: JSON.stringify({
  //       hotelPhone: phone,  // reuse field — it's the traveler's number
  //       changeRequest: `TDR refund alert: PNR ${pnr}, ${minutesLeft} minutes left to file`,
  //       reason: 'Train delayed over 3 hours — TDR refund window closing',
  //     })
  //   });
}

// ─── FIRESTORE ADMIN HELPERS ─────────────────────────────────────────────────
// Using firebase-admin SDK in route handlers (server-side only).
async function getFirebaseAdmin() {
  const { getApps, initializeApp, cert, getApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }

  return { db: getFirestore() };
}

// ─── MAIN CRON HANDLER ───────────────────────────────────────────────────────
export async function GET(request) {
  // Verify cron secret to prevent unauthorized triggering
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { checked: 0, eligible: 0, alerted: 0, errors: [] };

  try {
    const { db } = await getFirebaseAdmin();

    // Query all trips with active train bookings departing in the next 24 hours
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Firestore collection-group query across all trips' bookings subcollections
    const bookingsRef = db.collectionGroup('bookings');
    const snapshot = await bookingsRef
      .where('type', '==', 'train')
      .where('status', 'not-in', ['departed', 'completed', 'cancelled'])
      .get();

    for (const bookingDoc of snapshot.docs) {
      results.checked++;

      const booking = { id: bookingDoc.id, ...bookingDoc.data() };
      // Extract tripId from path: trips/{tripId}/bookings/{bookingId}
      const tripId = bookingDoc.ref.parent.parent?.id;
      if (!tripId) continue;

      // Skip if departure is outside our 24h window
      const deptTime = new Date(booking.start_datetime || booking.departure_time);
      if (isNaN(deptTime) || deptTime < now || deptTime > in24h) continue;

      try {
        // Fetch live status (TODO: replace mock with real API)
        const liveStatus = await fetchLiveTrainStatus(
          booking.pnr || booking.confirmation_number,
          booking.train_number,
        );

        // Run eligibility check
        const eligibility = evaluateTDREligibility(booking, liveStatus);
        if (!eligibility) continue;

        results.eligible++;

        // ── Dedup: check if we already sent an alert in the last 10 minutes ──
        const ledgerRef = db.collection('trips').doc(tripId).collection('ledgerEntries');
        const recentAlerts = await ledgerRef
          .where('event_type', '==', 'tdr_alert')
          .where('booking_id', '==', booking.id)
          .orderBy('created_at', 'desc')
          .limit(1)
          .get();

        if (!recentAlerts.empty) {
          const lastAlert = recentAlerts.docs[0].data();
          const lastAlertMs = lastAlert.created_at?.toMillis?.() || 0;
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          // Don't re-alert within 10 minutes UNLESS urgency has escalated
          const prevChannel = lastAlert.details?.channel;
          const newChannel = getTDREscalationChannel(eligibility.minutesRemaining);
          if (lastAlertMs > tenMinutesAgo && prevChannel === newChannel) continue;
        }

        // ── Determine escalation level ──────────────────────────────────────
        const channel = getTDREscalationChannel(eligibility.minutesRemaining);
        const { minutesRemaining, refundAmount, pnr, delayMinutes } = eligibility;

        const alertMessage = pnr
          ? `🚂 TDR Alert: Your train PNR ${pnr} is delayed by ${delayMinutes} mins. Claim ₹${refundAmount} refund — ${minutesRemaining} min left!`
          : `🚂 TDR Alert: Your train "${booking.title}" is delayed by ${delayMinutes} mins. File TDR now — ${minutesRemaining} min left!`;

        // ── Fire alert based on channel ─────────────────────────────────────
        const userId = booking.booked_by || booking.created_by || null;
        const userPhone = booking.contact_phone || null;

        if (channel === 'push') {
          await sendPushNotification({ userId, tripId, bookingId: booking.id, message: alertMessage });
        } else if (channel === 'sms') {
          if (userPhone) await sendSMS({ phone: userPhone, message: alertMessage });
          else await sendPushNotification({ userId, tripId, bookingId: booking.id, message: alertMessage });
        } else if (channel === 'call') {
          if (userPhone) {
            await initiateUrgentVapiCall({ phone: userPhone, pnr, minutesLeft: minutesRemaining, refundAmount });
          } else {
            await sendPushNotification({ userId, tripId, bookingId: booking.id, message: alertMessage });
          }
        }

        // ── Log to ledger (hash-chained, matching hashChain.js pattern) ─────
        const allEntries = await ledgerRef.orderBy('sequence_number', 'desc').limit(1).get();
        const lastSeq = allEntries.empty ? 0 : (allEntries.docs[0].data().sequence_number || 0);
        const lastHash = allEntries.empty ? null : allEntries.docs[0].data().entry_hash;

        const entryPayload = {
          event_type: 'tdr_alert',
          booking_id: booking.id,
          trip_id: tripId,
          amount: refundAmount,
          affected_users: userId ? [userId] : [],
          description: alertMessage,
          sequence_number: lastSeq + 1,
          details: {
            channel,
            minutesRemaining,
            delayMinutes,
            pnr: pnr || null,
            eligibleRefund: refundAmount,
          },
        };

        const entryHash = await generateEntryHash(entryPayload, lastHash);
        await ledgerRef.add({
          ...entryPayload,
          entry_hash: entryHash,
          previous_hash: lastHash || 'GENESIS',
          created_at: new Date(),
        });

        results.alerted++;
        console.log(`[TDR Autopilot] Alert sent: tripId=${tripId} bookingId=${booking.id} channel=${channel} remaining=${minutesRemaining}min`);
      } catch (bookingErr) {
        console.error(`[TDR Autopilot] Error processing booking ${booking.id}:`, bookingErr.message);
        results.errors.push({ bookingId: booking.id, error: bookingErr.message });
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (err) {
    console.error('[TDR Autopilot] Fatal error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
