import { db } from './config';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

/**
 * Creates a notification for a user.
 */
export async function createNotification(userId, data) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      ...data,
      read: false,
      created_at: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationRead(notificationId) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}
