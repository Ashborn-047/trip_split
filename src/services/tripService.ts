/**
 * TripSplit - Trip Service (Firebase/Firestore)
 * 
 * DESIGN DECISIONS:
 * 1. Trip creator becomes admin via members subcollection
 * 2. Join requires valid trip code
 * 3. Ghost members have isGhost = true
 * 4. member.id is the document ID used for paid_by references
 * 
 * MIGRATION NOTE: Service interface matches Supabase version.
 * To switch backends, only this file needs to change.
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    onSnapshot,
    serverTimestamp,
    type Unsubscribe
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Trip, TripMember, CreateTripInput, JoinTripInput, AddGhostMemberInput } from '../types';

// Collection references
const tripsCollection = collection(db, 'trips');

/**
 * Generates a 6-character uppercase trip code.
 */
function generateTripCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded ambiguous: I,O,0,1
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Converts Firestore timestamp to ISO string.
 */
function toISOString(timestamp: any): string {
    if (!timestamp) return new Date().toISOString();
    if (timestamp.toDate) return timestamp.toDate().toISOString();
    return new Date(timestamp).toISOString();
}

/**
 * Creates a new trip and adds the creator as admin member.
 */
export async function createTrip(
    input: CreateTripInput,
    userId: string
): Promise<{ trip: Trip; membership: TripMember }> {
    const code = generateTripCode();
    const tripId = `TRIP-${code}`;
    const tripRef = doc(db, 'trips', tripId);

    const tripData = {
        code,
        name: input.name || `${input.creatorDisplayName}'s Trip`,
        currency: 'INR',
        status: 'active',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        created_by: userId,
    };

    await setDoc(tripRef, tripData);

    // Add creator as admin member
    const memberRef = doc(collection(tripRef, 'members'));
    const memberData = {
        user_id: userId,
        display_name: input.creatorDisplayName,
        role: 'admin' as const,
        joined_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        is_ghost: false,
    };

    await setDoc(memberRef, memberData);

    const trip: Trip = {
        id: tripId,
        code,
        name: tripData.name,
        currency: 'INR',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
        created_by: userId,
    };

    const membership: TripMember = {
        id: memberRef.id,
        trip_id: tripId,
        user_id: userId,
        display_name: input.creatorDisplayName,
        role: 'admin',
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    return { trip, membership };
}

/**
 * Joins an existing trip by code.
 */
export async function joinTrip(
    input: JoinTripInput,
    userId: string
): Promise<{ trip: Trip; membership: TripMember }> {
    const normalizedCode = input.code.toUpperCase().trim();

    // Find trip by code
    const tripQuery = query(tripsCollection, where('code', '==', normalizedCode));
    const tripSnapshot = await getDocs(tripQuery);

    if (tripSnapshot.empty) {
        throw new Error('Trip not found. Please check the code and try again.');
    }

    const tripDoc = tripSnapshot.docs[0];
    const tripData = tripDoc.data();
    const tripId = tripDoc.id;

    // Check if already a member
    const membersRef = collection(db, 'trips', tripId, 'members');
    const memberQuery = query(membersRef, where('user_id', '==', userId));
    const existingMember = await getDocs(memberQuery);

    if (!existingMember.empty) {
        const memberDoc = existingMember.docs[0];
        const memberData = memberDoc.data();

        return {
            trip: {
                id: tripId,
                code: tripData.code,
                name: tripData.name,
                currency: tripData.currency || 'INR',
                status: tripData.status || 'active',
                created_at: toISOString(tripData.created_at),
                updated_at: toISOString(tripData.updated_at),
                archived_at: null,
                created_by: tripData.created_by,
            },
            membership: {
                id: memberDoc.id,
                trip_id: tripId,
                user_id: userId,
                display_name: memberData.display_name,
                role: memberData.role,
                joined_at: toISOString(memberData.joined_at),
                updated_at: toISOString(memberData.updated_at),
            },
        };
    }

    // Add as new member
    const newMemberRef = doc(membersRef);
    const newMemberData = {
        user_id: userId,
        display_name: input.displayName,
        role: 'member' as const,
        joined_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        is_ghost: false,
    };

    await setDoc(newMemberRef, newMemberData);

    return {
        trip: {
            id: tripId,
            code: tripData.code,
            name: tripData.name,
            currency: tripData.currency || 'INR',
            status: tripData.status || 'active',
            created_at: toISOString(tripData.created_at),
            updated_at: toISOString(tripData.updated_at),
            archived_at: null,
            created_by: tripData.created_by,
        },
        membership: {
            id: newMemberRef.id,
            trip_id: tripId,
            user_id: userId,
            display_name: input.displayName,
            role: 'member',
            joined_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    };
}

/**
 * Adds a ghost (offline) member to a trip.
 */
export async function addGhostMember(
    input: AddGhostMemberInput
): Promise<TripMember> {
    const membersRef = collection(db, 'trips', input.trip_id, 'members');
    const memberRef = doc(membersRef);

    const memberData = {
        user_id: null,
        display_name: input.display_name,
        role: 'ghost' as const,
        joined_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        is_ghost: true,
    };

    await setDoc(memberRef, memberData);

    return {
        id: memberRef.id,
        trip_id: input.trip_id,
        user_id: null,
        display_name: input.display_name,
        role: 'ghost',
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

/**
 * Gets a trip by ID.
 */
export async function getTrip(tripId: string): Promise<Trip | null> {
    const tripRef = doc(db, 'trips', tripId);
    const tripSnap = await getDoc(tripRef);

    if (!tripSnap.exists()) {
        return null;
    }

    const data = tripSnap.data();
    return {
        id: tripId,
        code: data.code,
        name: data.name,
        currency: data.currency || 'INR',
        status: data.status || 'active',
        created_at: toISOString(data.created_at),
        updated_at: toISOString(data.updated_at),
        archived_at: data.archived_at ? toISOString(data.archived_at) : null,
        created_by: data.created_by,
    };
}

/**
 * Gets all members of a trip.
 */
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
    const membersRef = collection(db, 'trips', tripId, 'members');
    const snapshot = await getDocs(membersRef);

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            trip_id: tripId,
            user_id: data.user_id || null,
            display_name: data.display_name,
            role: data.role,
            joined_at: toISOString(data.joined_at),
            updated_at: toISOString(data.updated_at),
        };
    });
}

/**
 * Gets the current user's membership for a trip.
 */
export async function getCurrentUserMembership(
    tripId: string,
    userId: string
): Promise<TripMember | null> {
    const membersRef = collection(db, 'trips', tripId, 'members');
    const memberQuery = query(membersRef, where('user_id', '==', userId));
    const snapshot = await getDocs(memberQuery);

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return {
        id: doc.id,
        trip_id: tripId,
        user_id: userId,
        display_name: data.display_name,
        role: data.role,
        joined_at: toISOString(data.joined_at),
        updated_at: toISOString(data.updated_at),
    };
}

/**
 * Updates a member's display name.
 */
export async function updateMemberDisplayName(
    tripId: string,
    memberId: string,
    displayName: string
): Promise<void> {
    const memberRef = doc(db, 'trips', tripId, 'members', memberId);
    await updateDoc(memberRef, {
        display_name: displayName,
        updated_at: serverTimestamp(),
    });
}

/**
 * Subscribes to real-time trip and member changes.
 */
export function subscribeToTrip(
    tripId: string,
    onTripUpdate: (trip: Trip) => void,
    onMembersUpdate: (members: TripMember[]) => void
): Unsubscribe {
    const tripRef = doc(db, 'trips', tripId);
    const membersRef = collection(db, 'trips', tripId, 'members');

    // Subscribe to trip changes
    const unsubTrip = onSnapshot(tripRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            onTripUpdate({
                id: tripId,
                code: data.code,
                name: data.name,
                currency: data.currency || 'INR',
                status: data.status || 'active',
                created_at: toISOString(data.created_at),
                updated_at: toISOString(data.updated_at),
                archived_at: data.archived_at ? toISOString(data.archived_at) : null,
                created_by: data.created_by,
            });
        }
    });

    // Subscribe to members changes
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
        const members = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                trip_id: tripId,
                user_id: data.user_id || null,
                display_name: data.display_name,
                role: data.role,
                joined_at: toISOString(data.joined_at),
                updated_at: toISOString(data.updated_at),
            };
        });
        onMembersUpdate(members);
    });

    // Return combined unsubscribe
    return () => {
        unsubTrip();
        unsubMembers();
    };
}
