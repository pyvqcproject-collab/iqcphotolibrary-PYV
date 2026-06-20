import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBCmXYBIrJcekuG0OndsrP8NaBtoD2LUCw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "iqcphotodefects.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "iqcphotodefects",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "iqcphotodefects.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "933800196179",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:933800196179:web:fd0cf749d694c57b176ea6",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-BN2LG3RCFG"
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 15000;
storage.maxOperationRetryTime = 15000;

