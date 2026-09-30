/**
 * PWA Sync Coordinator
 * 
 * Centralized coordination for background sync operations.
 * Prevents duplicate syncs, provides debouncing, and manages sync state.
 */

import { getQueuedCount } from '@/lib/pwa-queue';

interface SyncCoordinatorState {
  isSyncing: boolean;
  lastSyncTime: number;
  syncInProgress: Promise<any> | null;
  pendingTriggers: Set<string>;
  debounceTimeout: ReturnType<typeof setTimeout> | null;
  pendingResolvers: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void }>;
}

const state: SyncCoordinatorState = {
  isSyncing: false,
  lastSyncTime: 0,
  syncInProgress: null,
  pendingTriggers: new Set(),
  debounceTimeout: null,
  pendingResolvers: [],
};

const MIN_SYNC_INTERVAL = 3000; // Minimum 3 seconds between syncs
const DEBOUNCE_DELAY = 1500; // 1.5 second debounce for rapid triggers

/**
 * Check if a sync is currently in progress
 */
export function isSyncInProgress(): boolean {
  return state.isSyncing;
}

/**
 * Check if sync is needed (has pending uploads and not currently syncing)
 */
export async function shouldSync(): Promise<boolean> {
  // Don't sync if already syncing
  if (state.isSyncing) {
    console.debug('[sync-coordinator] Sync already in progress, skipping');
    return false;
  }

  // Check if enough time has passed since last sync (rate limiting)
  const timeSinceLastSync = Date.now() - state.lastSyncTime;
  if (timeSinceLastSync < MIN_SYNC_INTERVAL) {
    console.debug(
      `[sync-coordinator] Too soon since last sync (${timeSinceLastSync}ms < ${MIN_SYNC_INTERVAL}ms)`
    );
    return false;
  }

  // Check if there are items to sync
  const count = await getQueuedCount();
  if (count === 0) {
    console.debug('[sync-coordinator] No items to sync');
    return false;
  }

  return true;
}

/**
 * Debounced sync trigger
 * Multiple rapid calls will be coalesced into a single sync operation
 * Returns a promise that resolves when the sync actually completes
 */
export function triggerSyncDebounced(
  source: string,
  syncFunction: () => Promise<any>,
  showToast: boolean = true
): Promise<any> {
  console.debug(`[sync-coordinator] Sync trigger from: ${source}`);
  
  // Track the source of this trigger
  state.pendingTriggers.add(source);

  // Clear existing debounce timeout
  if (state.debounceTimeout) {
    clearTimeout(state.debounceTimeout);
  }

  // Create promise wrapper
  return new Promise((resolve, reject) => {
    state.pendingResolvers.push({ resolve, reject });

    // Set new debounce timeout
    state.debounceTimeout = setTimeout(async () => {
      state.debounceTimeout = null;
      
      // Capture and clear state for this execution
      const sources = Array.from(state.pendingTriggers).join(', ');
      state.pendingTriggers.clear();
      
      const currentResolvers = [...state.pendingResolvers];
      state.pendingResolvers = [];
      
      console.debug(`[sync-coordinator] Executing debounced sync (sources: ${sources})`);
      
      try {
        // Check if a sync is needed before acquiring the lock
        if (!(await shouldSync())) {
          // Resolve all waiting promises with null (no-op)
          currentResolvers.forEach(({ resolve: innerResolve }) => innerResolve(null));
          return;
        }

        // Execute the sync under the global lock
        const result = await executeSyncWithLock(sources, syncFunction, showToast);

        // Resolve all waiting promises
        currentResolvers.forEach(({ resolve: innerResolve }) => innerResolve(result));
      } catch (error) {
        // Reject all waiting promises
        currentResolvers.forEach(({ reject: innerReject }) => innerReject(error));
      }
    }, DEBOUNCE_DELAY);
  });
}

/**
 * Execute sync with global lock to prevent concurrent operations
 */
export async function executeSyncWithLock(
  source: string,
  syncFunction: () => Promise<any>,
  showToast: boolean = true
): Promise<any> {
  // Acquire lock
  if (state.isSyncing) {
    console.debug('[sync-coordinator] Another sync started before we could acquire lock');
    // Wait for the current sync to complete
    if (state.syncInProgress) {
      return await state.syncInProgress;
    }
    return null;
  }

  state.isSyncing = true;
  state.lastSyncTime = Date.now();

  console.log(`[sync-coordinator] Starting sync (source: ${source})`);

  try {
    // Execute the sync function
    const syncPromise = syncFunction();
    state.syncInProgress = syncPromise;
    
    const result = await syncPromise;
    
    console.log(`[sync-coordinator] Sync completed successfully (source: ${source})`, result);
    
    return result;
  } catch (error) {
    console.error(`[sync-coordinator] Sync failed (source: ${source}):`, error);
    throw error;
  } finally {
    // Release lock
    state.isSyncing = false;
    state.syncInProgress = null;
  }
}

/**
 * Force immediate sync bypass debounce (for user-initiated actions)
 */
export async function triggerSyncImmediate(
  source: string,
  syncFunction: () => Promise<any>,
  showToast: boolean = true
): Promise<any> {
  console.debug(`[sync-coordinator] Immediate sync trigger from: ${source}`);
  
  // Cancel any pending debounced sync
  if (state.debounceTimeout) {
    clearTimeout(state.debounceTimeout);
    state.debounceTimeout = null;
  }
  
  state.pendingTriggers.clear();
  
  // Check if a sync should run (rate limiting / queue presence)
  if (!(await shouldSync())) {
    return null;
  }

  return await executeSyncWithLock(source, syncFunction, showToast);
}

/**
 * Reset coordinator state (for testing/debugging)
 */
export function resetCoordinator(): void {
  if (state.debounceTimeout) {
    clearTimeout(state.debounceTimeout);
  }
  
  state.isSyncing = false;
  state.lastSyncTime = 0;
  state.syncInProgress = null;
  state.pendingTriggers.clear();
  state.debounceTimeout = null;
  state.pendingResolvers = [];
  
  console.debug('[sync-coordinator] State reset');
}

/**
 * Get coordinator stats for debugging
 */
export function getCoordinatorStats(): {
  isSyncing: boolean;
  lastSyncTime: number;
  timeSinceLastSync: number;
  pendingTriggers: Array<string>;
  hasPendingDebounce: boolean;
} {
  return {
    isSyncing: state.isSyncing,
    lastSyncTime: state.lastSyncTime,
    timeSinceLastSync: Date.now() - state.lastSyncTime,
    pendingTriggers: Array.from(state.pendingTriggers),
    hasPendingDebounce: state.debounceTimeout !== null,
  };
}
