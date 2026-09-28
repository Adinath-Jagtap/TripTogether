/**
 * src/lib/firebase/messaging.js
 * Client-side FCM: request permission, get token, save to Firestore.
 *
 * Usage:
 *   import { initPushNotifications } from '@/lib/firebase/messaging';
 *   const token = await initPushNotifications(userId, 'hotel'); // or 'guest'
 *
 * Tokens are stored in:
 *   - Firestore: fcmTokens/{token} → { uid, role, created_at }
 *   - Also added to users/{uid}.fcmTokens[] for easy lookup
 */
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db } from './config';
import { doc, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import app from './config';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

let messagingInstance = null;

function getMessagingInstance() {
  if (typeof window === 'undefined') return null;
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch (e) {
      console.warn('[FCM] getMessaging failed:', e.message);
      return null;
    }
  }
  return messagingInstance;
}

/**
 * Request notification permission, get FCM token, save to Firestore.
 * @param {string} uid   - Firebase Auth user UID (or hotel phone for hotel PWA)
 * @param {'guest'|'hotel'} role
 * @returns {Promise<string|null>} FCM token or null if denied/unsupported
 */
export async function initPushNotifications(uid, role = 'guest') {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) {
    console.warn('[FCM] Notifications not supported in this browser.');
    return null;
  }

  try {
    // Register the service worker if not yet registered
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied.');
      return null;
    }

    const messaging = getMessagingInstance();
    if (!messaging) return null;

    if (!VAPID_KEY) {
      console.warn('[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY not set — cannot get FCM token.');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('[FCM] No registration token returned.');
      return null;
    }

    // Persist token to Firestore
    await setDoc(doc(db, 'fcmTokens', token), {
      uid,
      role,
      token,
      created_at: serverTimestamp(),
    }, { merge: true });

    // Also add to the user/hotel doc for easy server-side lookup
    if (role === 'guest') {
      await updateDoc(doc(db, 'users', uid), {
        fcmTokens: arrayUnion(token),
      }).catch(() => {}); // user doc may not exist yet
    } else if (role === 'hotel') {
      await updateDoc(doc(db, 'hotels', uid), {
        fcmTokens: arrayUnion(token),
      }).catch(() => {});
    }

    console.log(`[FCM] Token registered for uid=${uid} role=${role}`);
    return token;

  } catch (err) {
    console.error('[FCM] initPushNotifications error:', err.message);
    return null;
  }
}

/**
 * Listen for foreground FCM messages (app is open).
 * Calls onMessageCallback(payload) when a message arrives.
 */
export function onForegroundMessage(onMessageCallback) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, onMessageCallback);
}

/**
 * Helper: call the server-side push API to send a notification.
 * Tokens can come from Firestore or be passed directly.
 */
export async function sendPushToTokens(tokens, title, body, data = {}) {
  if (!tokens?.length) return;
  try {
    await fetch('/api/notifications/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body, data }),
    });
  } catch (err) {
    console.error('[FCM] sendPushToTokens error:', err.message);
  }
}
