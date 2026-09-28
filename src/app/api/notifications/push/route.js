/**
 * POST /api/notifications/push
 * Sends a Firebase Cloud Messaging push to one or more FCM tokens.
 *
 * IMPORTANT: Uses DATA-ONLY messages (no "notification" field).
 * This is intentional — Android treats messages with a "notification" field as
 * "display messages" and handles them natively, bypassing the service worker.
 * Data-only messages always wake the service worker, even when screen is off.
 * The SW then calls showNotification() manually with full control over sound,
 * vibration, lock-screen visibility, and action buttons.
 *
 * Body: { tokens: string[], title: string, body: string, data?: object }
 * Requires env vars: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 *                    FIREBASE_ADMIN_PRIVATE_KEY
 */
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKey || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PROJECT_ID) {
    return null;
  }
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export async function POST(request) {
  try {
    const { tokens, title, body, data = {} } = await request.json();

    if (!tokens?.length || !title) {
      return NextResponse.json({ error: 'tokens and title are required' }, { status: 400 });
    }

    const app = getAdminApp();
    if (!app) {
      console.warn('[push] Firebase Admin not configured — FIREBASE_ADMIN_* env vars missing. Skipping push.');
      return NextResponse.json({ skipped: true, reason: 'admin_not_configured' });
    }

    const messaging = admin.messaging(app);

    // Build the data payload — ALL fields must be strings for FCM data messages
    const dataPayload = Object.fromEntries(
      Object.entries({ title, body, ...data })
        .map(([k, v]) => [k, v == null ? '' : String(v)])
    );

    const results = await Promise.allSettled(
      tokens.map(token =>
        messaging.send({
          token,
          // ── DATA-ONLY: no "notification" key ──────────────────────────────
          // Android with notification field = OS handles it, SW may be skipped.
          // Android with data-only = FCM wakes the SW unconditionally.
          data: dataPayload,

          android: {
            // HIGH priority wakes the device from Doze mode / screen-off
            priority: 'high',
            // ttl: 30 seconds — if device unreachable, don't deliver a stale call alert
            ttl: '30s',
            restrictedPackageName: undefined,
          },
          webpush: {
            headers: {
              Urgency: 'high',
              TTL: '30',
            },
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'background',
            },
            payload: {
              aps: {
                'content-available': 1,  // wake iOS app in background
              },
            },
          },
        })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed    = results.filter(r => r.status === 'rejected').length;

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[push] Token[${i}] failed:`, r.reason?.message || r.reason);
      }
    });

    console.log(`[push] "${title}" sent — ${succeeded}/${tokens.length} succeeded, ${failed} failed`);
    return NextResponse.json({ succeeded, failed, total: tokens.length });

  } catch (err) {
    console.error('[push] Unhandled error:', err.message);
    return NextResponse.json({ error: 'Failed to send push' }, { status: 500 });
  }
}
