# TripSplit - Offline Support

## Overview

TripSplit uses Supabase Realtime for live synchronization. When offline, the app provides limited functionality with eventual consistency.

## Offline Behavior

### What Works Offline

1. **Viewing Data**
   - Previously loaded trip data is cached in memory
   - Expenses, members, and balances remain visible
   - Settlement calculations work on cached data

2. **Adding Expenses (Queued)**
   - New expenses are stored in `localStorage` queue
   - Visual indicator shows "pending sync" status
   - Queued items persist across browser refresh

3. **Viewing Settlements**
   - Calculated from cached expense data
   - May not reflect changes from other users

### What Requires Connection

- Creating or joining trips
- AI receipt scanning (requires Gemini API)
- Real-time updates from other users
- Deleting expenses

## Sync Strategy

### Last-Write-Wins

TripSplit uses a **last-write-wins** conflict resolution strategy:

```
User A (offline): Adds expense at T1
User B (online):  Adds expense at T2
User A comes online: Syncs expense with T1 timestamp

Result: Both expenses exist, ordered by created_at timestamp
```

### Conflict Scenarios

| Scenario | Resolution |
|----------|------------|
| Same expense edited by 2 users | Last `updated_at` wins |
| Expense deleted while offline edit pending | Delete wins, edit discarded |
| Member added offline | Syncs normally on reconnect |

### Timestamp Handling

- All timestamps use server time (`NOW()` in PostgreSQL)
- Client timestamps are only used for local queue ordering
- `updated_at` is set by database trigger, not client

## Implementation Details

### Local Queue Structure

```typescript
interface QueuedAction {
  id: string;           // UUID for deduplication
  type: 'expense' | 'member';
  action: 'create' | 'update' | 'delete';
  payload: object;
  queuedAt: number;     // Client timestamp
  retryCount: number;
}
```

### Queue Processing

1. On reconnect, process queue in FIFO order
2. For each item:
   - Attempt to sync to Supabase
   - On success: remove from queue
   - On conflict (409): discard and notify user
   - On error: retry with exponential backoff (max 3 attempts)

### Storage Keys

```
localStorage:
  - tripsplit_queue: QueuedAction[]
  - tripsplit_active_trip: string (trip ID)
  - tripsplit_last_sync: number (timestamp)
```

## Limitations

1. **No CRDT/OT**: We do not implement advanced conflict resolution
2. **No Merge**: Conflicting edits are resolved by timestamp, not merged
3. **Queue Size**: Maximum 50 queued actions to prevent storage bloat
4. **Stale Data**: Cached data may be stale; refresh on reconnect

## User Expectations

- Offline mode is best-effort, not guaranteed
- Users should sync important expenses when online
- Settlement calculations may differ after sync
- AI features require internet connection

## Technical Notes

### Detecting Offline State

```typescript
// Browser API
const isOnline = navigator.onLine;

// Listen for changes
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);
```

### Supabase Realtime Reconnection

Supabase client handles WebSocket reconnection automatically. On reconnect:

1. Re-subscribe to trip channel
2. Fetch latest data
3. Process local queue
4. Update UI

---

*This document is for developer reference. End-user documentation should simplify these concepts.*
