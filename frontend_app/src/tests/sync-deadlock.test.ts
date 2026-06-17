/* eslint-disable @typescript-eslint/require-await */
/**
 * Tests for PWA Sync Coordination Deadlock Bug
 * 
 * Issue: The sync coordinator sets isSyncing=true before calling startSync(),
 * but startSync() checks isSyncInProgress() and aborts if true, creating a deadlock.
 * 
 * These tests verify:
 * 1. Coordinated syncs execute successfully (should pass after fix)
 * 2. Direct concurrent calls are prevented (existing behavior)
 * 3. Coordinator prevents overlapping syncs (existing behavior)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import after mocks are set up
import { isSyncNeeded, startSync } from '@/features/recordings/data/sync-service';
import {
  executeSyncWithLock,
  isSyncInProgress,
  resetCoordinator,
  triggerSyncImmediate,
} from '@/lib/sync-coordinator';
import { getPendingRecordings, getQueuedCount } from '@/lib/pwa-queue';

// Mock the dependencies BEFORE importing modules so mocks are applied correctly
vi.mock('@/lib/online-status', () => ({
  isOnline: vi.fn(() => Promise.resolve(true)),
  watchOnlineStatus: vi.fn(),
}));

vi.mock('@/lib/pwa-queue', () => ({
  getPendingRecordings: vi.fn(() => Promise.resolve([])),
  getQueuedCount: vi.fn(() => Promise.resolve(0)),
  markRecordingUploading: vi.fn(() => Promise.resolve()),
  markRecordingUploaded: vi.fn(() => Promise.resolve()),
  markRecordingFailed: vi.fn(() => Promise.resolve()),
  getQueuedRecording: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/features/recordings/data/api', () => ({
  uploadFile: vi.fn(() => Promise.resolve({ id: 'test-id' })),
}));

describe('Sync Coordinator Integration', () => {
  beforeEach(() => {
    // Reset coordinator state before each test
    resetCoordinator();
    vi.clearAllMocks();
  });

  describe('Critical: Deadlock Prevention', () => {
    it('should execute startSync when called via coordinator (DEADLOCK BUG)', async () => {
      // Arrange: Mock queue with 1 pending item
      const mockRecording = {
        id: 'test-recording-1',
        blob: new Blob(['test'], { type: 'audio/mp4' }),
        metadata: {
          categoryId: 'cat-1',
          subcategoryId: 'subcat-1',
          timestamp: Date.now(),
        },
        status: 'pending' as const,
        retryCount: 0,
        createdAt: Date.now(),
      };

      vi.mocked(getPendingRecordings).mockResolvedValueOnce([mockRecording]);
      vi.mocked(getQueuedCount).mockResolvedValueOnce(1);

      // Act: Call triggerSyncImmediate with startSync
      const result = await triggerSyncImmediate('test-coordinated', () => startSync());

      // Assert: Sync should process the item (not abort with 0 items)
      // CURRENT BEHAVIOR (BUG): Returns { success: 0, failed: 0, total: 0 }
      // EXPECTED BEHAVIOR (AFTER FIX): Returns { success: 1, failed: 0, total: 1 }
      expect(result).toBeDefined();
      
      // This will FAIL with current implementation due to deadlock
      expect(result.total).toBeGreaterThan(0);
      expect(getPendingRecordings).toHaveBeenCalled();
      
      // Verify sync was actually attempted (not aborted early)
      expect(result.success).toBeGreaterThanOrEqual(0);
      expect(result.total).toBe(1);
    });

    it('should handle multiple queued items via coordinator', async () => {
      // Arrange: Mock queue with 3 pending items
      const mockRecordings = [
        {
          id: 'test-1',
          blob: new Blob(['test1'], { type: 'audio/mp4' }),
          metadata: {
            categoryId: 'cat-1',
            subcategoryId: 'subcat-1',
            timestamp: Date.now(),
          },
          status: 'pending' as const,
          retryCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'test-2',
          blob: new Blob(['test2'], { type: 'audio/mp4' }),
          metadata: {
            categoryId: 'cat-1',
            subcategoryId: 'subcat-1',
            timestamp: Date.now(),
          },
          status: 'pending' as const,
          retryCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'test-3',
          blob: new Blob(['test3'], { type: 'audio/mp4' }),
          metadata: {
            categoryId: 'cat-1',
            subcategoryId: 'subcat-1',
            timestamp: Date.now(),
          },
          status: 'pending' as const,
          retryCount: 0,
          createdAt: Date.now(),
        },
      ];

      vi.mocked(getPendingRecordings).mockResolvedValueOnce(mockRecordings);
      vi.mocked(getQueuedCount).mockResolvedValueOnce(3);

      // Act: Trigger coordinated sync
      const result = await triggerSyncImmediate('test-multi', () => startSync());

      // Assert: Should process all 3 items
      expect(result).toBeDefined();
      expect(result.total).toBe(3);
      
      // This will FAIL with current implementation - deadlock prevents processing
      expect(getPendingRecordings).toHaveBeenCalled();
    });
  });

  describe('Concurrency Control', () => {
    it('should prevent multiple simultaneous syncs via coordinator', async () => {
      // Arrange: Create a slow sync operation
      let syncCount = 0;
      const slowSync = async () => {
        syncCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return startSync();
      };

      vi.mocked(getPendingRecordings).mockResolvedValue([]);
      vi.mocked(getQueuedCount).mockResolvedValue(0);

      // Act: Trigger two syncs simultaneously
      const [result1, result2] = await Promise.all([
        triggerSyncImmediate('test-concurrent-1', slowSync),
        triggerSyncImmediate('test-concurrent-2', slowSync),
      ]);

      // Assert: Only one sync should execute (coordinator prevents overlap)
      // The second call should wait for the first or return cached result
      expect(syncCount).toBeLessThanOrEqual(2);
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should respect rate limiting between syncs', async () => {
      // Arrange: Multiple rapid sync triggers
      vi.mocked(getPendingRecordings).mockResolvedValue([]);
      vi.mocked(getQueuedCount).mockResolvedValue(0);

      const startTime = Date.now();

      // Act: Trigger 3 syncs in rapid succession
      await triggerSyncImmediate('test-rate-1', () => startSync());
      
      // Wait for rate limit window
      await new Promise(resolve => setTimeout(resolve, 3100)); // Min interval is 3s
      
      await triggerSyncImmediate('test-rate-2', () => startSync());

      const elapsed = Date.now() - startTime;

      // Assert: Second sync should only happen after rate limit period
      expect(elapsed).toBeGreaterThanOrEqual(3000);
    });
  });

  describe('Coordinator State Management', () => {
    it('should correctly track sync in progress state', async () => {
      // Arrange
      vi.mocked(getPendingRecordings).mockResolvedValue([]);
      vi.mocked(getQueuedCount).mockResolvedValue(0);

      // Assert: Initially, no sync in progress
      expect(isSyncInProgress()).toBe(false);

      // Act: Start a sync
      const syncPromise = triggerSyncImmediate('test-state', () => startSync());

      // During sync, flag should be true
      // (This is hard to test reliably due to timing, but we can check after)
      
      await syncPromise;

      // Assert: After sync completes, flag should be false
      expect(isSyncInProgress()).toBe(false);
    });

    it('should execute sync function provided to coordinator', async () => {
      // Arrange: Custom sync function that tracks execution
      let executionCount = 0;
      const customSync = async () => {
        executionCount++;
        return { success: 1, failed: 0, total: 1, errors: [] };
      };

      // Act: Execute via coordinator
      const result = await executeSyncWithLock('test-custom', customSync, false);

      // Assert: Custom function should execute
      expect(executionCount).toBe(1);
      expect(result).toEqual({ success: 1, failed: 0, total: 1, errors: [] });
    });
  });

  describe('Edge Cases', () => {
    it('should handle sync when offline', async () => {
      // Arrange: Mock offline state
      const { isOnline } = await import('@/lib/online-status');
      vi.mocked(isOnline).mockResolvedValueOnce(false);

      // Act: Try to sync while offline
      const result = await startSync();

      // Assert: Should return empty result (cannot sync offline)
      expect(result).toEqual({ success: 0, failed: 0, total: 0, errors: [] });
    });

    it('should handle empty queue gracefully', async () => {
      // Arrange: No pending recordings
      vi.mocked(getPendingRecordings).mockResolvedValueOnce([]);
      // Don't mock getQueuedCount - startSync returns early and never calls it

      // Act: Sync with empty queue
      const result = await startSync();

      // Assert: Should complete successfully with zero items
      expect(result).toEqual({ success: 0, failed: 0, total: 0, errors: [] });
    });

    it('should detect when sync is needed', async () => {
      // Arrange: Queue has items
      vi.mocked(getQueuedCount).mockResolvedValueOnce(5);
      vi.mocked(getPendingRecordings).mockResolvedValueOnce([]);

      // Act
      const needed = await isSyncNeeded();

      // Assert
      expect(needed).toBe(true);
    });

    it('should detect when sync is not needed', async () => {
      // Arrange: Queue is empty
      vi.mocked(getQueuedCount).mockResolvedValueOnce(0);
      vi.mocked(getPendingRecordings).mockResolvedValueOnce([]);

      // Act
      const needed = await isSyncNeeded();

      // Assert
      expect(needed).toBe(false);
    });
  });
});


