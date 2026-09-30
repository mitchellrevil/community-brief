/* eslint-disable @typescript-eslint/require-await */
/**
 * Upload Queue Optimization Tests
 * 
 * Tests for visibility-aware polling that pauses when tab is hidden
 * and resumes when tab becomes visible.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUploadQueue } from '@/hooks/useUploadQueue';

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
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Advance to first polling interval (30s)
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getQueuedCount).toHaveBeenCalledTimes(2);

    // Advance to second polling interval
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getQueuedCount).toHaveBeenCalledTimes(3);
  });

  it('should not poll when tab is hidden', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call when visible
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Hide the tab
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    // Advance timer past several polling intervals
    await act(async () => {
      vi.advanceTimersByTime(90000); // 90 seconds = 3 polling intervals
    });

    // Should still only have the initial call - no new polls while hidden
    expect(getQueuedCount).toHaveBeenCalledTimes(1);
  });

  it('should resume polling when tab becomes visible again', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Hide the tab
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    // Advance time while hidden (no polling should happen)
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Show the tab again - should trigger immediate refresh
    await act(async () => {
      simulateVisibilityChange('visible');
      // Allow any microtasks to settle
      await Promise.resolve();
    });

    // Should have refreshed when becoming visible (2 calls total)
    expect(getQueuedCount).toHaveBeenCalledTimes(2);

    // And polling should resume after interval
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(getQueuedCount).toHaveBeenCalledTimes(3);
  });

  it('should refresh data immediately when tab becomes visible', async () => {
    const { getQueuedCount, getQueueStats } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Clear call counts after initial load
    vi.clearAllMocks();

    // Hide then show tab
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await act(async () => {
      simulateVisibilityChange('visible');
      // Allow any microtasks to settle
      await Promise.resolve();
    });

    // Should immediately refresh queue data when becoming visible
    expect(getQueuedCount).toHaveBeenCalled();
    expect(getQueueStats).toHaveBeenCalled();
  });

  it('should use 30-second polling interval as fallback', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Advance 10 seconds - old interval would have triggered
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // Should not have polled at 10s anymore
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Advance additional 20 seconds to reach 30s total
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    // Should have polled at 30s
    expect(getQueuedCount).toHaveBeenCalledTimes(2);
  });

  it('should stop polling interval when tab becomes hidden', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Advance 15 seconds (halfway through interval)
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    // Hide tab before interval fires
    await act(async () => {
      simulateVisibilityChange('hidden');
    });

    // Advance past when interval would have fired
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    // Should not have new polls because tab is hidden
    expect(getQueuedCount).toHaveBeenCalledTimes(1);
  });

  it('should handle rapid visibility changes gracefully', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    renderHook(() => useUploadQueue());

    // Initial call
    expect(getQueuedCount).toHaveBeenCalledTimes(1);

    // Rapid visibility changes
    await act(async () => {
      simulateVisibilityChange('hidden');
      simulateVisibilityChange('visible');
      simulateVisibilityChange('hidden');
      simulateVisibilityChange('visible');
      // Allow any microtasks to settle
      await Promise.resolve();
    });

    // Should handle gracefully without errors and refresh at least once
    // Each visibility -> visible triggers a refresh
    expect(getQueuedCount).toHaveBeenCalled();
  });

  it('should maintain correct state after multiple visibility cycles', async () => {
    const { getQueuedCount } = await import('@/lib/pwa-queue');
    
    const { result } = renderHook(() => useUploadQueue());

    // Cycle 1: hide and show
    await act(async () => {
      simulateVisibilityChange('hidden');
      vi.advanceTimersByTime(5000);
    });

    await act(async () => {
      simulateVisibilityChange('visible');
    });

    // Cycle 2: hide and show
    await act(async () => {
      simulateVisibilityChange('hidden');
      vi.advanceTimersByTime(5000);
    });

    await act(async () => {
      simulateVisibilityChange('visible');
    });

    // Should still be functional
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    // Polling should work normally after multiple cycles
    expect(getQueuedCount).toHaveBeenCalled();
    expect(result.current.refreshQueue).toBeDefined();
  });
});

describe('Upload Queue Event-Driven Updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expose refreshQueue function for event-driven updates', () => {
    const { result } = renderHook(() => useUploadQueue());

    expect(result.current.refreshQueue).toBeDefined();
    expect(typeof result.current.refreshQueue).toBe('function');
  });

  it('should update state when refreshQueue is called', async () => {
    const { getQueuedCount, getQueueStats } = await import('@/lib/pwa-queue');
    
    // Mock different values
    vi.mocked(getQueuedCount).mockResolvedValue(5);
    vi.mocked(getQueueStats).mockResolvedValue({ pending: 3, failed: 2, retryable: 1, totalSize: 1000 });

    const { result } = renderHook(() => useUploadQueue());

    await act(async () => {
      await result.current.refreshQueue();
    });

    expect(result.current.queuedCount).toBe(5);
    expect(result.current.stats?.pending).toBe(3);
    expect(result.current.stats?.failed).toBe(2);
  });
});
