import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, getDoc, setDoc, serverTimestamp,
  query, where, getDocs, limit, doc,
} from 'firebase/firestore';

const PRIMARY_PHONE = '+918369848711';
const FALLBACK_PHONE = '+918104578518';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      tripId, bookingId, hotelName, hotelPhone,
      guestName, bookingRef, changeRequest,
      originalTime, newTime, reason,
    } = body;

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const requestedPhone = hotelPhone || PRIMARY_PHONE;
    const cleanPhone = requestedPhone.replace(/\s+/g, '').trim();

    // Target numbers to auto-register and notify behind the scenes
    const targetNumbers = Array.from(new Set([PRIMARY_PHONE, FALLBACK_PHONE, cleanPhone]));

    // Auto-seed/ensure Firestore hotel records for target numbers so calls always succeed
    const hotelFcmTokens = [];
    for (const num of targetNumbers) {
      try {
        const hotelRef = doc(db, 'hotels', num);
        const snap = await getDoc(hotelRef);
        if (!snap.exists()) {
          await setDoc(hotelRef, {
            name: hotelName || 'Hotel Vendor',
            phone: num,
            registered_at: serverTimestamp(),
          }, { merge: true });
        } else {
          const tokens = snap.data()?.fcmTokens || [];
          tokens.forEach(t => { if (!hotelFcmTokens.includes(t)) hotelFcmTokens.push(t); });
        }
      } catch (err) {
        console.warn(`[call-initiate] Error processing target hotel ${num}:`, err.message);
      }
    }

    // ── Duplicate-call guard ──────────────────────────────────────────────────
    const existingQ = query(
      collection(db, 'calls'),
      where('tripId', '==', tripId),
      where('bookingId', '==', bookingId || null),
      where('status', 'in', ['ringing', 'connected']),
      limit(1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingStatus = existingDoc.data().status;
      console.log(`[call-initiate] Returning existing active call ${existingDoc.id} (status: ${existingStatus})`);
      return NextResponse.json({ callId: existingDoc.id, status: existingStatus, existing: true });
    }

    // Create a call document in Firestore — the hotel's PWA listens for this via onSnapshot
    const callRef = await addDoc(collection(db, 'calls'), {
      tripId,
      bookingId: bookingId || null,
      hotelName: hotelName || 'Hotel Vendor',
      hotelPhone: cleanPhone,
      guestName: guestName || 'Guest',
      bookingRef: bookingRef || 'N/A',
      changeRequest: changeRequest || 'Reschedule required',
      originalTime: originalTime || null,
      newTime: newTime || null,
      reason: reason || 'Travel disruption',
      status: 'ringing',
      outcome: null,
      created_at: serverTimestamp(),
      connected_at: null,
      ended_at: null,
    });

    // ── Push incoming-call notification to hotel devices ──────────────────────
    if (hotelFcmTokens.length > 0) {
      try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await fetch(`${origin}/api/notifications/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: hotelFcmTokens,
            title: '📞 Incoming AI Call',
            body: `${guestName || 'A TripTogether guest'} is calling about booking ${bookingRef || 'your booking'}. Tap to answer.`,
            data: {
              type: 'incoming_call',
              callId: callRef.id,
              url: '/call/receive',
              openUrl: '/call/receive',
              guestName: guestName || '',
              bookingRef: bookingRef || '',
              hotelName: hotelName || '',
            },
          }),
        });
        console.log(`[call-initiate] Incoming-call push sent to ${hotelFcmTokens.length} token(s)`);
      } catch (pushErr) {
        console.warn('[call-initiate] Failed to send FCM push:', pushErr.message);
      }
    }

    return NextResponse.json({ callId: callRef.id, status: 'ringing' });
  } catch (err) {
    console.error('[call-initiate] error:', err);
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 });
  }
}
