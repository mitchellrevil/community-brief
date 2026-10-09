/**
 * PWA Background Sync Service
 * 
 * Handles automatic uploading of queued recordings when connection is restored.
 * Can be called from the service worker or directly from the app.
 * Uses sync coordinator to prevent duplicate concurrent syncs.
 */

import type { AudioFfmpegMetadata } from '@/lib/ffmpegConvert';
import type { RecordingSettings } from '@/types/audio-upload';
import { isOnline } from '@/lib/online-status';
import {
  getPendingRecordings,
  getQueuedCount,
  getQueuedRecording,
  markRecordingFailed,
  markRecordingUploaded,
  markRecordingUploading,
} from '@/lib/pwa-queue';
import { uploadFile } from '@/features/recordings/data/api';
import { getAudioFileExtension, normalizeAudioFilename } from '@/lib/audio-format';

interface SyncResult {
  success: number;
  failed: number;
  total: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Process the upload queue and attempt to upload all pending recordings
 * This should be called through the sync coordinator to prevent concurrent syncs
 */
export async function startSync(): Promise<SyncResult> {
  console.debug('[sync-service] Starting sync...');
  
  // Check if we're actually online
  const online = await isOnline();
  if (!online) {
    console.log('[sync-service] Cannot sync - offline');
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  const pending = await getPendingRecordings();
  
  if (pending.length === 0) {
    console.log('[sync-service] No pending recordings to sync');
    return { success: 0, failed: 0, total: 0, errors: [] };
  }

  console.log(`[sync-service] Found ${pending.length} recordings to upload`);

  const result: SyncResult = {
    success: 0,
    failed: 0,
    total: pending.length,
    errors: [],
  };

  // Process recordings sequentially to avoid overwhelming the server
  for (const recording of pending) {
    try {
      console.log('[sync-service] Uploading recording:', recording.id);
      
      // Mark as uploading - this acts as a lock to prevent duplicate processing
      await markRecordingUploading(recording.id);
      
      // Verify the recording is still in the queue and in uploading state
      // (prevents race condition if another process already processed it)
      const currentState = await getQueuedRecording(recording.id);
      if (!currentState || currentState.status !== 'uploading') {
        console.warn('[sync-service] Recording state changed during upload, skipping:', recording.id);
        continue;
      }

      // Create a File object from the blob with proper extension
      const fileExtension = recording.blob.type === 'text/vtt'
        ? 'vtt'
        : getAudioFileExtension(recording.blob.type) ?? 'm4a';
      const fileName = recording.metadata.fileName ||
        `queued-recording-${recording.metadata.timestamp}.${fileExtension}`;

      let file = normalizeAudioFilename(new File(
        [recording.blob],
        fileName,
        { type: recording.blob.type || (fileName.toLowerCase().endsWith('.vtt') ? 'text/vtt' : 'audio/mp4') }
      ));
      const sourceMimeType = file.type;
      const conversionMetadata: AudioFfmpegMetadata = {};

      // Convert audio/video to WAV for backend processing (happens here when back online)
      if (!file.name.toLowerCase().endsWith('.vtt') &&
          (file.type.startsWith('audio/') || file.type.startsWith('video/')) &&
          file.type !== 'audio/wav' && !file.type.includes('wav')) {
        try {
          console.log('[sync-service] Converting to WAV for upload:', recording.id, {
            originalType: file.type,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2)
          });
          const { convertToWavWithFFmpeg } = await import('@/lib/ffmpegConvert');
          file = await convertToWavWithFFmpeg(file, {
            setIsConverting: () => {},
            setConversionProgress: () => {},
            setConversionStep: () => {},
            onMetadata: (meta) => { Object.assign(conversionMetadata, meta); },
          });
          console.log('[sync-service] Audio prepared for upload:', recording.id, {
            mimeType: file.type,
            convertedToWav: conversionMetadata.convertedToWav === true,
            newSizeMB: (file.size / (1024 * 1024)).toFixed(2)
          });
        } catch (conversionError) {
          console.error('[sync-service] WAV conversion failed:', recording.id, conversionError);
          // Mark as failed and increment retry - don't upload unconverted file
          throw new Error(`WAV conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
        }
      }

      const uploadMetadata = recording.metadata.uploadMetadata;
      let actualUploadMetadata = uploadMetadata;
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        const settings: RecordingSettings = {
          ...uploadMetadata?.recording_settings,
          source_mime_type: uploadMetadata?.recording_settings?.source_mime_type ?? sourceMimeType,
          mime_type: file.type,
        };
        if (conversionMetadata.convertedToWav === true) {
          settings.sample_rate_hz = 16000;
          settings.channels = 1;
          settings.codec = 'pcm_s16le';
          delete settings.bitrate_kbps;
        } else if (getAudioFileExtension(file.type) !== 'wav' && settings.codec === 'pcm_s16le') {
          delete settings.codec;
          delete settings.sample_rate_hz;
          delete settings.channels;
        }
        actualUploadMetadata = { ...uploadMetadata, recording_settings: settings };
      }

      // Upload using the existing API
      const response = await uploadFile(
        file,
        recording.metadata.categoryId,
        recording.metadata.subcategoryId,
        recording.metadata.preSessionData,
        undefined,
        actualUploadMetadata
      );

      console.log('[sync-service] Upload successful:', recording.id, response);

      // Remove from queue
      await markRecordingUploaded(recording.id);
      result.success++;

      // Add delay between uploads to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error('[sync-service] Upload failed:', recording.id, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Mark as failed and increment retry count
      await markRecordingFailed(recording.id, errorMessage);
      result.failed++;
      result.errors.push({
        id: recording.id,
        error: errorMessage,
      });

      // Continue with next recording even if this one failed
    }
  }

  console.log('[sync-service] Sync complete:', result);
  return result;
}

/**
 * Check if sync is needed (has pending uploads)
 */
export async function isSyncNeeded(): Promise<boolean> {
  // Use both the queued count and pending recordings as a robust check.
  // Some tests mock one or the other; combining them reduces fragility.
  try {
    const [count, pending] = await Promise.all([getQueuedCount(), getPendingRecordings()]);
    const queued = typeof count === 'number' ? count : 0;
    const pendingCount = Array.isArray(pending) ? pending.length : 0;
    try {
       
      console.debug('[sync-service] isSyncNeeded - queued:', queued, 'pendingCount:', pendingCount);
    } catch (e) {
      // ignore
    }
    return queued > 0 || pendingCount > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Calculate exponential backoff delay
 */
export function getBackoffDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 16s)
  const baseDelay = 1000;
  const maxDelay = 16000;
  return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
}


