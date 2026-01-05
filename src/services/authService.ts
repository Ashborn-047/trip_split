/**
 * TripSplit - Authentication Service (Firebase)
 * 
 * Supports:
 * - Anonymous authentication (for quick start)
 * - Email/password authentication (for account persistence)
 * 
 * Anonymous users can upgrade to email auth later without losing data.
 */

import {
    signInAnonymously as firebaseSignInAnonymously,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    updateProfile,
    type User,
    type Unsubscribe
} from 'firebase/auth';
import { auth } from '../config/firebase';

export type { User };

/**
 * Signs in anonymously.
 * Creates a temporary account that persists across sessions.
 * Can be upgraded to email auth later.
 */
export async function signInAnonymously(): Promise<User> {
    const result = await firebaseSignInAnonymously(auth);
    return result.user;
}

/**
 * Signs in with email and password.
 */
export async function signInWithEmail(
    email: string,
    password: string
): Promise<User> {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
}

/**
 * Creates a new account with email and password.
 */
export async function createAccount(
    email: string,
    password: string,
    displayName?: string
): Promise<User> {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName) {
        await updateProfile(result.user, { displayName });
    }

    return result.user;
}

/**
 * Signs out the current user.
 */
export async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
}

/**
 * Gets the current authenticated user.
 * Returns null if not authenticated.
 */
export function getCurrentUser(): User | null {
    return auth.currentUser;
}

/**
 * Subscribes to authentication state changes.
 * Callback is called immediately with current state, then on each change.
 */
export function onAuthStateChanged(
    callback: (user: User | null) => void
): Unsubscribe {
    return firebaseOnAuthStateChanged(auth, callback);
}

/**
 * Checks if the current user is anonymous.
 */
export function isAnonymousUser(): boolean {
    return auth.currentUser?.isAnonymous ?? false;
}

/**
 * Gets the current user's ID.
 * Returns null if not authenticated.
 */
export function getCurrentUserId(): string | null {
    return auth.currentUser?.uid ?? null;
}
