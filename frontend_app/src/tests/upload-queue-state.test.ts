/* eslint-disable @typescript-eslint/require-await */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadQueue } from '../hooks/useUploadQueue';
import * as pwaQueue from '../lib/pwa-queue';
import * as syncCoordinator from '../lib/sync-coordinator';
import * as syncService from '@/features/recordings/data/sync-service';

// Mock dependencies
vi.mock('../lib/pwa-queue', () => ({
  getQueuedCount: vi.fn(),
  getQueueStats: vi.fn(),
}));

vi.mock('@/features/recordings/data/sync-service', () => ({
  isSyncNeeded: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock('../lib/online-status', () => ({
  watchOnlineStatus: vi.fn(() => () => {}),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useUploadQueue State Synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(pwaQueue.getQueuedCount).mockResolvedValue(1);
    vi.mocked(pwaQueue.getQueueStats).mockResolvedValue({
      pending: 1,
      failed: 0,
      retryable: 0,
      totalSize: 1000
    });
    vi.mocked(syncService.isSyncNeeded).mockResolvedValue(true);
    
    // Reset coordinator state
    syncCoordinator.resetCoordinator();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should maintain isProcessing=true during debounced sync', async () => {
    const { result } = renderHook(() => useUploadQueue());

    // Mock startSync to take some time
    let resolveSync: (value: any) => void;
    const syncPromise = new Promise((resolve) => {
      resolveSync = resolve;
    });
    vi.mocked(syncService.startSync).mockImplementation(() => syncPromise as any);

    // Initial state check
    expect(result.current.isProcessing).toBe(false);

    // Trigger sync but don't await it yet (because it waits for timers)
    let syncOperationPromise: Promise<void>;
    
    await act(async () => {
      syncOperationPromise = result.current.syncQueue();
    });

    // It should immediately set isProcessing = true
    expect(result.current.isProcessing).toBe(true);

    // Advance time partly to ensure debounce is pending
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Should still be processing (waiting for debounce)
    expect(result.current.isProcessing).toBe(true);

    // Advance past debounce (1.5s + buffer)
    await act(async () => {
      vi.advanceTimersByTime(1100); 
    });
    
    // Now syncService.startSync should have been called
    expect(syncService.startSync).toHaveBeenCalled();
    // And isProcessing should STILL be true because syncPromise hasn't resolved
    expect(result.current.isProcessing).toBe(true);

    // Resolve the sync
    await act(async () => {
      resolveSync!({ success: 1, failed: 0 });
    });
    
    // Now explicitly wait for the sync queue operation to finish
    await syncOperationPromise!;
    
    // Now it should be done
    expect(result.current.isProcessing).toBe(false);
  });

  it('should coalesce multiple rapid triggers', async () => {
    const { result } = renderHook(() => useUploadQueue());

    // Mock quick sync
    vi.mocked(syncService.startSync).mockResolvedValue({ success: 1, failed: 0, total: 1, errors: [] });

    // Trigger twice (these are async)
    let p1: Promise<void>, p2: Promise<void>;
    await act(async () => {
      p1 = result.current.syncQueue();
      p2 = result.current.syncQueue();
    });

    expect(result.current.isProcessing).toBe(true);

    // Fast forward
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await Promise.all([p1!, p2!]);

    expect(syncService.startSync).toHaveBeenCalledTimes(1);
    expect(result.current.isProcessing).toBe(false);
  });

  it('should handle errors correctly and reset state', async () => {
    const { result } = renderHook(() => useUploadQueue());

    // Mock error
    vi.mocked(syncService.startSync).mockRejectedValue(new Error('Sync failed'));

    let p1: Promise<void>;
    await act(async () => {
      p1 = result.current.syncQueue();
    });

    expect(result.current.isProcessing).toBe(true);

    // Fast forward
    await act(async () => {
       vi.advanceTimersByTime(2000);
    });

    await p1!;

    expect(syncService.startSync).toHaveBeenCalledTimes(1);
    expect(result.current.isProcessing).toBe(false);
  });
});
