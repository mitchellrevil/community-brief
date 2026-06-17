/**
 * PWA Upload Queue Storage Utility
 * 
 * Provides persistent storage for recordings queued for upload when offline.
 * Uses IndexedDB with idb library for type-safe operations.
 * Separate from draft-storage.ts - this is for upload retry queue only.
 */

import { openDB } from 'idb';
import { getStorageLimits } from './audio-compression';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { AudioUploadMetadata } from '@/types/audio-upload';

const DB_NAME = 'CommunityBriefUploadQueue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-uploads';
const MAX_RETRY_COUNT = 5;

// Size-based timeout calculation constants
const BASE_UPLOAD_TIMEOUT = 20 * 60 * 1000; // 20 minutes base timeout
const MIN_UPLOAD_SPEED_BPS = 100 * 1024; // 100 KB/s (slow 3G assumption)

export interface QueuedRecording {
  id: string;
  blob: Blob;
  metadata: {
    categoryId: string;
    subcategoryId: string;
    categoryName?: string;
    subcategoryName?: string;
    preSessionData?: Record<string, any>;
    timestamp: number;
    uploadMetadata?: AudioUploadMetadata;
  };
  status: 'pending' | 'uploading' | 'failed';
  retryCount: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

interface UploadQueueDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: QueuedRecording;
    indexes: { 'by-status': string; 'by-created': number };
  };
}

/**
 * Calculate upload timeout based on file size
 * Uses worst-case upload speed assumption (100 KB/s on slow 3G)
 * to prevent false positives for "stuck" uploads on slow connections
 * 
 * @param fileSizeBytes - Size of the file in bytes
 * @returns Timeout in milliseconds
 */
export function calculateUploadTimeout(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) {
    return BASE_UPLOAD_TIMEOUT;
  }
  
  // Calculate estimated upload time at minimum speed
  const estimatedTimeSeconds = fileSizeBytes / MIN_UPLOAD_SPEED_BPS;
  const estimatedTimeMs = estimatedTimeSeconds * 1000;
  
  // Return the maximum of base timeout or estimated time
  return Math.max(BASE_UPLOAD_TIMEOUT, estimatedTimeMs);
}

/**
 * Initialize and get database instance
 */
async function getDB(): Promise<IDBPDatabase<UploadQueueDB>> {
  return openDB<UploadQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-created', 'createdAt');
      }
    },
  });
}

/**
 * Add a recording to the upload queue
 * Stores original MP4 recording without compression for offline queue
 * Conversion to WAV happens during sync when back online
 */
export async function queueRecording(
  blob: Blob,
  metadata: QueuedRecording['metadata']
): Promise<string> {
  const db = await getDB();
  
  // Store original MP4/M4A without compression
  // Conversion to WAV will happen during sync when online
  const audioBlob = blob;
  
  console.debug('[pwa-queue] Queueing recording without compression', {
    type: blob.type,
    sizeMB: (blob.size / (1024 * 1024)).toFixed(2)
  });
  
  // Check individual file size against platform limits
  const limits = getStorageLimits();
  const fileSizeMB = audioBlob.size / (1024 * 1024);
  
 if (fileSizeMB > limits.singleFileMB) {
    throw new Error(
      `Unable to queue recording. Please ensure you are connected to a strong internet connection before pressing Submit. ` +
      `File size: ${fileSizeMB.toFixed(1)}MB exceeds limit of ${limits.singleFileMB}MB.`
    );
  }

  // Check total queue size
  const allRecordings = await db.getAll(STORE_NAME);
  const totalQueueSizeMB = allRecordings.reduce((sum, r) => sum + (r.blob.size / (1024 * 1024)), 0);
  
  if (totalQueueSizeMB + fileSizeMB > limits.totalQueueMB) {
    throw new Error(
      `Queue full on ${limits.platform}: Total would be ${(totalQueueSizeMB + fileSizeMB).toFixed(1)}MB, ` +
      `limit is ${limits.totalQueueMB}MB. Please upload queued recordings to free space.`
    );
  }
  
  const id = `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const recording: QueuedRecording = {
    id,
    blob: audioBlob, // Store original MP4/M4A
    metadata,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  };

  await db.add(STORE_NAME, recording);
  
  return id;
}

/**
 * Get all pending recordings from the queue
 * Excludes items currently being uploaded unless they've timed out
 */
export async function getPendingRecordings(): Promise<Array<QueuedRecording>> {
  const db = await getDB();
  const now = Date.now();
  
  // Get pending recordings
  const recordings = await db.getAllFromIndex(STORE_NAME, 'by-status', 'pending');
  
  // Get items in uploading state
  const uploading = await db.getAllFromIndex(STORE_NAME, 'by-status', 'uploading');
  
  // Reset items stuck in uploading state past timeout (using size-based calculation)
  const stuckItems: Array<QueuedRecording> = [];
  for (const item of uploading) {
    const uploadDuration = now - (item.lastAttempt || item.createdAt);
    const timeout = calculateUploadTimeout(item.blob.size);
    
    if (uploadDuration > timeout) {
      const timeoutMinutes = (timeout / 1000 / 60).toFixed(1);
      const durationMinutes = (uploadDuration / 1000 / 60).toFixed(1);
      console.warn(
        `[pwa-queue] Recording stuck in uploading state for ${durationMinutes}min (timeout: ${timeoutMinutes}min, size: ${(item.blob.size / 1024 / 1024).toFixed(1)}MB), resetting:`,
        item.id
      );
      item.status = 'pending'; // Reset to pending so it can be retried
      await db.put(STORE_NAME, item);
      stuckItems.push(item);
    }
  }
  
  // Also get failed recordings that haven't exceeded retry limit
  const failed = await db.getAllFromIndex(STORE_NAME, 'by-status', 'failed');
  const retryable = failed.filter(r => r.retryCount < MAX_RETRY_COUNT);
  
  // Return pending + retryable + stuck items (but not currently uploading)
  return [...recordings, ...retryable, ...stuckItems].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get count of pending recordings
 */
export async function getQueuedCount(): Promise<number> {
  const db = await getDB();
  const pending = await db.countFromIndex(STORE_NAME, 'by-status', 'pending');
  
  // Count failed that can still be retried
  const failed = await db.getAllFromIndex(STORE_NAME, 'by-status', 'failed');
  const retryable = failed.filter(r => r.retryCount < MAX_RETRY_COUNT).length;
  
  return pending + retryable;
}

/**
 * Mark recording as successfully uploaded and remove from queue
 */
export async function markRecordingUploaded(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
  console.debug('[pwa-queue] Recording uploaded, removed from queue:', id);
}

/**
 * Mark recording as failed and increment retry count
 */
export async function markRecordingFailed(id: string, error: string): Promise<void> {
  const db = await getDB();
  const recording = await db.get(STORE_NAME, id);
  
  if (recording) {
    recording.status = 'failed';
    recording.retryCount += 1;
    recording.lastAttempt = Date.now();
    recording.error = error;
    
    await db.put(STORE_NAME, recording);
    
    console.debug(`[pwa-queue] Recording failed (attempt ${recording.retryCount}/${MAX_RETRY_COUNT}):`, id);
    
    // If max retries exceeded, notify user
    if (recording.retryCount >= MAX_RETRY_COUNT) {
      console.error('[pwa-queue] Recording exceeded max retries:', id);
    }
  }
}

/**
 * Update recording status to uploading
 */
export async function markRecordingUploading(id: string): Promise<void> {
  const db = await getDB();
  const recording = await db.get(STORE_NAME, id);
  
  if (recording) {
    recording.status = 'uploading';
    recording.lastAttempt = Date.now();
    await db.put(STORE_NAME, recording);
  }
}

/**
 * Get a specific recording from the queue
 */
export async function getQueuedRecording(id: string): Promise<QueuedRecording | undefined> {
  const db = await getDB();
  return await db.get(STORE_NAME, id);
}

/**
 * Clear all completed uploads (for cleanup)
 */
export async function clearCompletedRecordings(): Promise<void> {
  const db = await getDB();
  
  // Remove recordings that have been uploaded or exceeded max retries
  const all = await db.getAll(STORE_NAME);
  const toRemove = all.filter(r => 
    r.status === 'failed' && r.retryCount >= MAX_RETRY_COUNT
  );
  
  for (const recording of toRemove) {
    await db.delete(STORE_NAME, recording.id);
  }
  
  console.debug('[pwa-queue] Cleaned up completed recordings:', toRemove.length);
}

/**
 * Clear all recordings from queue (for debugging/testing)
 */
export async function clearAllQueue(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
  console.debug('[pwa-queue] Queue cleared');
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  failed: number;
  retryable: number;
  totalSize: number;
}> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  
  const pending = all.filter(r => r.status === 'pending').length;
  const failed = all.filter(r => r.status === 'failed').length;
  const retryable = all.filter(r => r.status === 'failed' && r.retryCount < MAX_RETRY_COUNT).length;
  const totalSize = all.reduce((sum, r) => sum + r.blob.size, 0);
  
  return { pending, failed, retryable, totalSize };
}
