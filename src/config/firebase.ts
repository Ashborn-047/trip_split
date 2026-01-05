/**
 * TripSplit - Firebase Configuration
 * 
 * Firebase provides:
 * - Firestore: NoSQL document database with real-time sync
 * - Auth: Anonymous and email authentication
 * - Offline persistence: Built-in IndexedDB caching
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
    getAuth,
    type Auth,
    connectAuthEmulator
} from 'firebase/auth';
import {
    getFirestore,
    type Firestore,
    connectFirestoreEmulator,
    enableIndexedDbPersistence
} from 'firebase/firestore';

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error(
        'Missing Firebase configuration. ' +
        'Please set VITE_FIREBASE_* environment variables in your .env file.'
    );
}

// Initialize Firebase
export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Enable offline persistence (IndexedDB)
// This allows the app to work offline and sync when back online
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time
        console.warn('[Firebase] Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        // Browser doesn't support persistence
        console.warn('[Firebase] Persistence not supported in this browser');
    }
});

// Connect to emulators in development (optional)
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('[Firebase] Connected to emulators');
}
