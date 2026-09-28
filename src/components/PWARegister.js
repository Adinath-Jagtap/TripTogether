'use client';
import { useEffect } from 'react';

/**
 * Registers the Firebase Messaging service worker app-wide.
 * 
 * This must run on EVERY page — not just /call/receive — because Chrome
 * requires an active service worker with a fetch handler before it will
 * offer the "Install" PWA prompt. Without this component in the root
 * layout, first-time visitors on "/" see "Create shortcut" instead of
 * "Install".
 *
 * NOTE: This only registers the SW file. It does NOT request Notification
 * permission — that happens contextually on pages where it makes sense
 * (call/receive, disruption) via initPushNotifications().
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
      .then(reg => {
        console.log('[PWA] Service worker registered, scope:', reg.scope);
      })
      .catch(err => {
        console.warn('[PWA] Service worker registration failed:', err.message);
      });
  }, []);

  return null;
}
