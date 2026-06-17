/**
 * Audio Compression Utility
 * 
 * Converts audio recordings to compressed MP3 format before queuing for offline storage.
 * Reduces file size by 80-90% while maintaining acceptable quality for transcription.
 */

import type {FFmpeg} from '@ffmpeg/ffmpeg';

/**
 * Detect platform type for storage quota awareness
 */
export function getPlatform(): 'desktop' | 'tablet' | 'mobile' {
  const ua = navigator.userAgent.toLowerCase();
  
  // Check for mobile platforms
  if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return 'mobile';
  }
  
  // Check for tablets
  if (/ipad|android(?!.*mobi)|tablet/i.test(ua)) {
    return 'tablet';
  }
  
  return 'desktop';
}

/**
 * Get storage limits by platform (in MB)
 */
export function getStorageLimits() {
  const platform = getPlatform();
  
  return {
    desktop: {
      platform: 'desktop',
      singleFileMB: 500, // Generous for desktop
      totalQueueMB: 2000, // ~40 5-minute recordings
      recommendedBitrate: 96 // kbps - good quality
    },
    tablet: {
      platform: 'tablet',
      singleFileMB: 100,
      totalQueueMB: 500, // ~10 5-minute recordings
      recommendedBitrate: 96
    },
    mobile: {
      platform: 'mobile',
      singleFileMB: 500, // Increased to 500MB for mobile uploads
      totalQueueMB: 2000, // Align with desktop queue capacity
      recommendedBitrate: 64 // Lower bitrate for mobile
    }
  }[platform];
}

// Singleton instance and initialization promise
let ffmpegInstance: FFmpeg | null = null;
let initPromise: Promise<FFmpeg> | null = null;

/**
 * Get the shared FFmpeg singleton instance.
 * Lazily initializes FFmpeg and loads the WASM binary on first call.
 * Subsequent calls reuse the same instance to avoid re-downloading the 25MB WASM.
 * @returns Promise resolving to the shared FFmpeg instance
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }
  
  // Prevent multiple simultaneous initializations
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    try {
      // Dynamically import FFmpeg to avoid loading it if not needed
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const instance = new FFmpeg();
      
      // Load WASM binary only if not already loaded
      if (!instance.loaded) {
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
        
        await instance.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
        });
      }
      
      ffmpegInstance = instance;
      return instance;
    } catch (error) {
      initPromise = null; // Reset promise on failure so we can retry
      throw error;
    }
  })();
  
  return initPromise;
}

/**
 * Convert audio blob to MP3 using FFmpeg
 * Returns compressed MP3 blob
 */
export async function compressAudioToMP3(
  blob: Blob,
  targetBitrate?: number
): Promise<Blob> {
  try {
    const limits = getStorageLimits();
    const bitrate = targetBitrate || limits.recommendedBitrate;
    
    console.log(`[Audio Compression] Converting to MP3 (${bitrate}kbps)...`);
    
    const ffmpeg = await getFFmpeg();

    // Write input file to virtual filesystem
    // Use unique names to avoid collisions when using shared singleton instance
    const uniqueId = Math.random().toString(36).substring(7);
    const inputName = `input_${uniqueId}.wav`;
    const outputName = `output_${uniqueId}.mp3`;
    
    const inputData = new Uint8Array(await blob.arrayBuffer());
    await ffmpeg.writeFile(inputName, inputData);

    // Run FFmpeg command to convert to MP3
    // -acodec libmp3lame: Use MP3 codec
    // -b:a: Set audio bitrate (e.g., 96k for 96kbps)
    // -y: Overwrite output file
    await ffmpeg.exec([
      '-i', inputName,
      '-acodec', 'libmp3lame',
      '-b:a', `${bitrate}k`,
      '-y',
      outputName
    ]);

    // Read compressed file from virtual filesystem
    const data = await ffmpeg.readFile(outputName);
    // Match the existing pattern from ffmpegConvert.ts
    const mp3Blob = new Blob([data as any], { type: 'audio/mpeg' });
    
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const originalSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    const compressedSizeMB = (mp3Blob.size / (1024 * 1024)).toFixed(2);
    const ratio = ((1 - mp3Blob.size / blob.size) * 100).toFixed(0);
    
    console.log(
      `[Audio Compression] Success: ${originalSizeMB}MB → ${compressedSizeMB}MB ` +
      `(${ratio}% reduction)`
    );

    return mp3Blob;
  } catch (error) {
    console.error('[Audio Compression] Failed:', error);
    // Fall back to original blob if compression fails
    return blob;
  }
}

/**
 * Format storage limits for UI display
 */
export function formatStorageLimits(): string {
  const limits = getStorageLimits();
  const platform = limits.platform;
  
  // Rough estimate: 5-minute recording at bitrate
  const estimatedSizePer5Min = (limits.recommendedBitrate * 60 * 5) / (8 * 1024); // MB
  const estimatedRecordings = Math.floor(limits.totalQueueMB / estimatedSizePer5Min);
  
  return (
    `${platform === 'desktop' ? '💻' : platform === 'tablet' ? '📱' : '📱'} ` +
    `${limits.totalQueueMB}MB queue ` +
    `(~${estimatedRecordings} 5-min recordings) • ` +
    `Single file max: ${limits.singleFileMB}MB`
  );
}
