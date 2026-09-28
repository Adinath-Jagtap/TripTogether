/**
 * Firestore helper layer — mirrors the Supabase API patterns used throughout the app.
 * Collections:
 *   trips/{tripId}
 *   trips/{tripId}/members/{userId}
 *   trips/{tripId}/bookings/{bookingId}
 *   trips/{tripId}/bookingDependencies/{id}
 *   trips/{tripId}/expenses/{expenseId}
 *   trips/{tripId}/expenseShares/{shareId}
 *   trips/{tripId}/settlements/{id}
 *   trips/{tripId}/ledgerEntries/{id}
 *   trips/{tripId}/disruptions/{id}
 *   users/{uid}
 */

import { db } from './config';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, limit, getCountFromServer, onSnapshot,
} from 'firebase/firestore';

// ──────────────────────────────────────────────
// USERS / PROFILES
// ──────────────────────────────────────────────
export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// ──────────────────────────────────────────────
// TRIPS
// ──────────────────────────────────────────────
export async function getTrip(tripId) {
  const snap = await getDoc(doc(db, 'trips', tripId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getUserTrips(uid) {
  const q = query(collection(db, 'trips'), where('owner_id', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTripsByMembership(uid) {
  const q = query(
    collection(db, 'trips'),
    where('member_ids', 'array-contains', uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTrip(data) {
  const ref = await addDoc(collection(db, 'trips'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTrip(tripId, data) {
  await updateDoc(doc(db, 'trips', tripId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTrip(tripId) {
  // Delete all subcollections first (Firestore does not cascade-delete automatically)
  const subcollections = ['bookings', 'bookingDependencies', 'expenses', 'settlements', 'ledgerEntries', 'disruptions', 'members'];
  for (const sub of subcollections) {
    try {
      const snap = await getDocs(collection(db, 'trips', tripId, sub));
      for (const d of snap.docs) {
        // For expenses, also delete nested shares
        if (sub === 'expenses') {
          try {
            const sharesSnap = await getDocs(collection(db, 'trips', tripId, 'expenses', d.id, 'shares'));
            for (const s of sharesSnap.docs) await deleteDoc(s.ref);
          } catch (_) {}
        }
        await deleteDoc(d.ref);
      }
    } catch (_) {}
  }
  await deleteDoc(doc(db, 'trips', tripId));
}


export async function getTripByInviteCode(code) {
  const q = query(collection(db, 'trips'), where('invite_code', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  return null;
}

// ──────────────────────────────────────────────
// TRIP MEMBERS  (subcollection: trips/{id}/members)
// ──────────────────────────────────────────────
export async function getTripMembers(tripId) {
  const snap = await getDocs(collection(db, 'trips', tripId, 'members'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTripMember(tripId, userId, data) {
  await setDoc(doc(db, 'trips', tripId, 'members', userId), {
    user_id: userId,
    ...data,
    joined_at: serverTimestamp(),
  }, { merge: true });
  // Also keep member_ids array on the trip doc for easy queries
  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  if (tripSnap.exists()) {
    const existing = tripSnap.data().member_ids || [];
    if (!existing.includes(userId)) {
      await updateDoc(tripRef, { member_ids: [...existing, userId] });
    }
  }
}

export async function removeTripMember(tripId, userId) {
  await deleteDoc(doc(db, 'trips', tripId, 'members', userId));
}

export async function getMemberCount(tripId) {
  const snap = await getCountFromServer(collection(db, 'trips', tripId, 'members'));
  return snap.data().count || 1;
}

// ──────────────────────────────────────────────
// BOOKINGS  (subcollection: trips/{id}/bookings)
// ──────────────────────────────────────────────
export async function getBookings(tripId) {
  const q = query(
    collection(db, 'trips', tripId, 'bookings'),
    orderBy('start_datetime', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addBooking(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'bookings'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateBooking(tripId, bookingId, data) {
  await updateDoc(doc(db, 'trips', tripId, 'bookings', bookingId), data);
}

export async function deleteBooking(tripId, bookingId) {
  await deleteDoc(doc(db, 'trips', tripId, 'bookings', bookingId));
}

// ──────────────────────────────────────────────
// BOOKING DEPENDENCIES
// ──────────────────────────────────────────────
export async function getBookingDependencies(tripId) {
  const snap = await getDocs(collection(db, 'trips', tripId, 'bookingDependencies'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addBookingDependency(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'bookingDependencies'), data);
  return ref.id;
}

export async function deleteBookingDependency(tripId, depId) {
  await deleteDoc(doc(db, 'trips', tripId, 'bookingDependencies', depId));
}

// ──────────────────────────────────────────────
// EXPENSES
// ──────────────────────────────────────────────
export async function getExpenses(tripId) {
  const q = query(
    collection(db, 'trips', tripId, 'expenses'),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addExpense(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'expenses'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function deleteExpense(tripId, expenseId) {
  // Also delete all shares
  const sharesSnap = await getDocs(collection(db, 'trips', tripId, 'expenses', expenseId, 'shares'));
  for (const s of sharesSnap.docs) {
    await deleteDoc(s.ref);
  }
  await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId));
}

// ──────────────────────────────────────────────
// EXPENSE SHARES
// ──────────────────────────────────────────────
export async function addExpenseShare(tripId, expenseId, data) {
  await addDoc(collection(db, 'trips', tripId, 'expenses', expenseId, 'shares'), data);
}

export async function getExpenseShares(tripId, expenseId) {
  const snap = await getDocs(collection(db, 'trips', tripId, 'expenses', expenseId, 'shares'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAllExpenseShares(tripId, expenses) {
  const all = [];
  for (const exp of expenses) {
    const shares = await getExpenseShares(tripId, exp.id);
    all.push(...shares.map(s => ({ ...s, expense_id: exp.id })));
  }
  return all;
}

// ──────────────────────────────────────────────
// SETTLEMENTS
// ──────────────────────────────────────────────
export async function getSettlements(tripId) {
  const snap = await getDocs(collection(db, 'trips', tripId, 'settlements'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSettlement(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'settlements'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

// ──────────────────────────────────────────────
// LEDGER ENTRIES
// ──────────────────────────────────────────────
export async function getLedgerEntries(tripId) {
  const q = query(
    collection(db, 'trips', tripId, 'ledgerEntries'),
    orderBy('sequence_number', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addLedgerEntry(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'ledgerEntries'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

// ──────────────────────────────────────────────
// DISRUPTIONS
// ──────────────────────────────────────────────
export async function getDisruptions(tripId) {
  const q = query(
    collection(db, 'trips', tripId, 'disruptions'),
    orderBy('created_at', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addDisruption(tripId, data) {
  const ref = await addDoc(collection(db, 'trips', tripId, 'disruptions'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateDisruption(tripId, disruptionId, data) {
  await updateDoc(doc(db, 'trips', tripId, 'disruptions', disruptionId), data);
}

// ──────────────────────────────────────────────
// RECOVERY VOTES (subcollection: trips/{id}/recovery_votes)
// ──────────────────────────────────────────────
export async function createRecoveryVote(tripId, disruptionId, plans, totalMembers = 1) {
  const voteRef = doc(collection(db, 'trips', tripId, 'recovery_votes'));
  const voteId = voteRef.id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5-minute countdown

  const voteDoc = {
    id: voteId,
    trip_id: tripId,
    disruption_id: disruptionId || 'disruption_active',
    plans: plans || [],
    total_members: Math.max(Number(totalMembers) || 1, 1),
    votes: {},
    resolutionStatus: 'open', // 'open' | 'majority' | 'unanimous' | 'owner_override' | 'expired'
    winningPlanIndex: null,
    created_at: serverTimestamp(),
    expires_at: expiresAt.toISOString(),
  };

  await setDoc(voteRef, voteDoc);
  return { id: voteId, ...voteDoc };
}

export async function castRecoveryVote(tripId, voteId, userId, userName, planIndex) {
  const voteRef = doc(db, 'trips', tripId, 'recovery_votes', voteId);
  const snap = await getDoc(voteRef);
  if (!snap.exists()) throw new Error('Recovery vote session not found');

  const data = snap.data();
  if (data.resolutionStatus !== 'open') {
    return { id: voteId, ...data };
  }

  const updatedVotes = { ...(data.votes || {}), [userId]: Number(planIndex) };
  const totalMembers = Math.max(Number(data.total_members) || 1, 1);
  const castUserIds = Object.keys(updatedVotes);

  // Count votes per plan index
  const counts = {};
  Object.values(updatedVotes).forEach(idx => {
    counts[idx] = (counts[idx] || 0) + 1;
  });

  let resolutionStatus = 'open';
  let winningPlanIndex = null;

  // Check for majority or unanimity
  for (const [idxStr, count] of Object.entries(counts)) {
    const pIdx = Number(idxStr);
    if (count > totalMembers / 2) {
      resolutionStatus = 'majority';
      winningPlanIndex = pIdx;
      if (count === totalMembers) {
        resolutionStatus = 'unanimous';
      }
      break;
    }
  }

  const updatePayload = {
    votes: updatedVotes,
    resolutionStatus,
    winningPlanIndex,
    updated_at: serverTimestamp(),
  };

  await updateDoc(voteRef, updatePayload);

  // Record individual vote entry subcollection
  try {
    const entryRef = doc(db, 'trips', tripId, 'recovery_votes', voteId, 'entries', userId);
    await setDoc(entryRef, {
      user_id: userId,
      user_name: userName || 'Traveler',
      plan_index: Number(planIndex),
      voted_at: serverTimestamp(),
    }, { merge: true });
  } catch (_) {}

  return { id: voteId, ...data, ...updatePayload };
}

export function listenToRecoveryVote(tripId, voteId, callback) {
  const voteRef = doc(db, 'trips', tripId, 'recovery_votes', voteId);
  return onSnapshot(voteRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Recovery vote snapshot error:', err);
  });
}

export async function finalizeRecoveryVote(tripId, voteId, winningPlanIndex, statusReason = 'owner_override') {
  const voteRef = doc(db, 'trips', tripId, 'recovery_votes', voteId);
  await updateDoc(voteRef, {
    resolutionStatus: statusReason,
    winningPlanIndex: Number(winningPlanIndex),
    finalized_at: serverTimestamp(),
  });
}

export async function applyWinningPlan(tripId, plan, userId = 'system') {
  if (!plan || !Array.isArray(plan.changes)) return;

  const appliedList = [];
  for (const ch of plan.changes) {
    if (!ch.booking_id) continue;
    try {
      const bRef = doc(db, 'trips', tripId, 'bookings', ch.booking_id);
      const bSnap = await getDoc(bRef);
      if (!bSnap.exists()) continue;

      const currentB = bSnap.data();
      const updates = {
        risk_level: 'low',
        updated_at: serverTimestamp(),
      };

      if (ch.action === 'cancel') {
        updates.status = 'cancelled';
        updates.title = `${currentB.title} (Cancelled)`;
      } else if (ch.action === 'reschedule') {
        updates.status = 'rescheduled';
        if (ch.new_start) updates.start_datetime = ch.new_start;
        if (ch.new_end) updates.end_datetime = ch.new_end;
        if (!currentB.title.includes('Rescheduled')) {
          updates.title = `${currentB.title} (Rescheduled +${plan.time_impact_minutes || 180}m)`;
        }
      } else if (ch.action === 'replace' && ch.new_title) {
        updates.status = 'replaced';
        updates.title = ch.new_title;
        if (ch.new_start) updates.start_datetime = ch.new_start;
        if (ch.new_end) updates.end_datetime = ch.new_end;
      }

      await updateDoc(bRef, updates);
      appliedList.push({ id: ch.booking_id, ...currentB, ...updates });
    } catch (bErr) {
      console.warn('Apply booking update note:', bErr.message);
    }
  }

  // Appends cryptographic ledger entry
  try {
    const existingLedger = await getLedgerEntries(tripId);
    const prevHash = existingLedger.length > 0 ? existingLedger[existingLedger.length - 1].entry_hash : 'GENESIS';

    const { generateEntryHash } = await import('@/lib/algorithms/hashChain');
    const entryData = {
      event_type: 'disruption_recovery',
      description: `${plan.plan_label} applied: ${appliedList.length} bookings adjusted (${plan.summary || 'Rescheduled'}).`,
      amount: Number(plan.additional_cost) || 0,
      affected_users: [userId],
      created_at: new Date().toISOString(),
      sequence_number: Date.now(),
    };

    const entryHash = await generateEntryHash(entryData, prevHash);
    await addLedgerEntry(tripId, {
      ...entryData,
      entry_hash: entryHash,
      previous_hash: prevHash,
    });
  } catch (lErr) {
    console.warn('Ledger entry note:', lErr.message);
  }

  return appliedList;
}
