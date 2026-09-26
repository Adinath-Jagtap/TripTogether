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
  serverTimestamp, limit, getCountFromServer,
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
