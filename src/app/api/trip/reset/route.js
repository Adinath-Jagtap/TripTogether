import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Firebase Admin SDK would be needed for server-side Firestore deletes.
    // For now, return a message directing to the Firebase console or client-side clear.
    // To fully implement: install firebase-admin and use admin.firestore() to batch delete.
    return NextResponse.json({
      success: true,
      message: 'To reset Firestore data, use the Firebase Console at https://console.firebase.google.com. ' +
               'Client-side localStorage trip data can be cleared by visiting /dashboard?reset=1',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Reset failed', details: err.message }, { status: 500 });
  }
}
