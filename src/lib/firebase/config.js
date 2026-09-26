import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCLJ50rOFAFSgQt0FvGumS8TVMDjy3JbE8',
  authDomain: 'gen-lang-client-0819611817.firebaseapp.com',
  projectId: 'gen-lang-client-0819611817',
  storageBucket: 'gen-lang-client-0819611817.firebasestorage.app',
  messagingSenderId: '509201510412',
  appId: '1:509201510412:web:0d64e0bc8ff1afb478fe29',
  measurementId: 'G-RHX453PRK0',
};

// Prevent duplicate app initialization in Next.js hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
