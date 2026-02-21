import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// ╔═══════════════════════════════════════════════════════════╗
// ║  REPLACE THESE WITH YOUR FIREBASE CONFIG VALUES           ║
// ║  Found in: Firebase Console → Project Settings → General  ║
// ╚═══════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "AIzaSyD968sLOt8xbRnUAPFdoZRfXVWEddPd1EY",
  authDomain: "wedding-budget-tracker-v4.vercel.app/",
  databaseURL: "https://wedding-budget-tracker-40902-default-rtdb.firebaseio.com/",
  projectId: "wedding-budget-tracker-40902",
  storageBucket: "wedding-budget-tracker-40902.firebasestorage.app",
  messagingSenderId: "767975547713",
  appId: "1:767975547713:web:d7a9b3db067ba0e64eb7c0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);
