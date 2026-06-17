/* eslint-disable @typescript-eslint/require-await */
/**
 * Upload Queue Tests - Colocated
 * 
 * Tests for:
 * - Visibility-aware polling that pauses when tab is hidden
 * - Event-driven updates via refreshQueue
 * - State synchronization during debounced sync
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import * as syncService from '@/features/recordings/data/sync-service';
import * as pwaQueue from '@/lib/pwa-queue';
import * as syncCoordinator from '@/lib/sync-coordinator';

// Mock dependencies
vi.mock('@/lib/pwa-queue', () => ({
  getQueueStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0, retryable: 0, totalSize: 0 }),
  getQueuedCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/lib/sync-service', () => ({
  isSyncNeeded: vi.fn().mockResolvedValue(false),
  startSync: vi.fn().mockResolvedValue({ success: 0, failed: 0, total: 0, errors: [] }),
}));

vi.mock('@/lib/online-status', () => ({
  watchOnlineStatus: vi.fn((callback) => {
    // Return cleanup function
    return () => {};
  }),
}));

vi.mock('@/lib/sync-coordinator', () => ({
  isSyncInProgress: vi.fn().mockReturnValue(false),
  triggerSyncDebounced: vi.fn().mockResolvedValue({ success: 0, failed: 0, total: 0, errors: [] }),
  resetCoordinator: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Store visibility state mock
let mockVisibilityState: DocumentVisibilityState = 'visible';
let visibilityChangeListeners: Array<EventListener> = [];

describe('Upload Queue Visibility-Aware Polling', () => {
  const originalAddEventListener = document.addEventListener;
  const originalRemoveEventListener = document.removeEventListener;

  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibilityState = 'visible';
    visibilityChangeListeners = [];

    // Mock document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => mockVisibilityState,
    });

    // Mock addEventListener to capture visibilitychange listeners
    document.addEventListener = vi.fn((event: string, listener: EventListener) => {
      if (event === 'visibilitychange') {
        visibilityChangeListeners.push(listener);
      }
      return originalAddEventListener.call(document, event, listener);
    });

    document.removeEventListener = vi.fn((event: string, listener: EventListener) => {
      if (event === 'visibilitychange') {
        visibilityChangeListeners = visibilityChangeListeners.filter(l => l !== listener);
      }
      return originalRemoveEventListener.call(document, event, listener);
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.addEventListener = originalAddEventListener;
    document.removeEventListener = originalRemoveEventListener;
  });

  // Helper to simulate visibility change
  const simulateVisibilityChange = (state: DocumentVisibilityState) => {
    mockVisibilityState = state;
    visibilityChangeListeners.forEach(listener => {
      listener(new Event('visibilitychange'));
    });
  };

  it('should register visibilitychange event listener on mount', () => {
    const { unmount } = renderHook(() => useUploadQueue());

    expect(document.addEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );

    unmount();
  });

  it('should remove visibilitychange event listener on unmount', () => {
    const { unmount } = renderHook(() => useUploadQueue());

    unmount();

    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
  });

  it('should poll when tab is visible', async () => {
    renderHook(() => useUploadQueue());

    // Initial call
    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(1);

    // Advance to first polling interval (30s)
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(2);

    // Advance to second polling interval
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(3);
  });

  it('should not poll when tab is hidden', async () => {
    renderHook(() => useUploadQueue());

    // Initial call when visible
    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(1);

    // Hide the tab
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    // Advance timer past several polling intervals
    await act(async () => {
      vi.advanceTimersByTime(90000); // 90 seconds = 3 polling intervals
    });

    // Should still only have the initial call - no new polls while hidden
    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(1);
  });

  it('should resume polling when tab becomes visible again', async () => {
    renderHook(() => useUploadQueue());

    // Initial call
    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(1);

    // Hide the tab
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    // Advance time while hidden (no polling should happen)
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(1);

    // Show the tab again - should trigger immediate refresh
    await act(async () => {
      simulateVisibilityChange('visible');
      // Allow any microtasks to settle
      await Promise.resolve();
    });

    // Should have refreshed when becoming visible (2 calls total)
    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(2);

    // And polling should resume after interval
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(pwaQueue.getQueuedCount).toHaveBeenCalledTimes(3);
  });

  it('should expose refreshQueue function for event-driven updates', () => {
    const { result } = renderHook(() => useUploadQueue());

    expect(result.current.refreshQueue).toBeDefined();
    expect(typeof result.current.refreshQueue).toBe('function');
  });

  it('should update state when refreshQueue is called', async () => {
    // Mock different values
    vi.mocked(pwaQueue.getQueuedCount).mockResolvedValue(5);
    vi.mocked(pwaQueue.getQueueStats).mockResolvedValue({ pending: 3, failed: 2, retryable: 1, totalSize: 1000 });

    const { result } = renderHook(() => useUploadQueue());

    await act(async () => {
      await result.current.refreshQueue();
    });

    expect(result.current.queuedCount).toBe(5);
    expect(result.current.stats?.pending).toBe(3);
    expect(result.current.stats?.failed).toBe(2);
  });
});

// Note: State Synchronization tests (isProcessing, coalescing, error handling)
// are covered in src/tests/upload-queue-state.test.ts which requires the actual
// sync-coordinator to function correctly with its resetCoordinator() behavior.
