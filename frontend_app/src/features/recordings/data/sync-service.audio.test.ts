import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startSync } from './sync-service';

const mocks = vi.hoisted(() => ({
  getPendingRecordings: vi.fn(),
  uploadFile: vi.fn(),
  convertToWavWithFFmpeg: vi.fn(),
}));
vi.mock('@/lib/online-status', () => ({ isOnline: () => Promise.resolve(true) }));
vi.mock('@/lib/pwa-queue', () => ({
  getPendingRecordings: mocks.getPendingRecordings,
  getQueuedRecording: () => Promise.resolve({ status: 'uploading' }),
  markRecordingUploading: vi.fn(),
  markRecordingUploaded: vi.fn(),
  markRecordingFailed: vi.fn(),
  getQueuedCount: vi.fn(),
}));
vi.mock('@/features/recordings/data/api', () => ({ uploadFile: mocks.uploadFile }));
vi.mock('@/lib/ffmpegConvert', () => ({ convertToWavWithFFmpeg: mocks.convertToWavWithFFmpeg }));

describe('queued audio format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadFile.mockResolvedValue({ job_id: 'synthetic-job' });
  });

  async function syncAudio(type: string, fileName: string) {
    mocks.getPendingRecordings.mockResolvedValue([{
      id: 'synthetic-queued-recording',
      blob: new Blob(['synthetic audio'], { type }),
      metadata: {
        categoryId: 'category', subcategoryId: 'subcategory', timestamp: 1, fileName,
        uploadMetadata: {
          recording_settings: { mime_type: type, source_mime_type: type },
          recording_consent: { accepted: true, policy_version: 'test-policy', accepted_at: '2026-10-06T00:00:00Z' },
        },
      },
    }]);
    vi.useFakeTimers();
    try {
      const sync = startSync();
      await vi.runAllTimersAsync();
      expect((await sync).success).toBe(1);
      return mocks.uploadFile.mock.calls[0];
    } finally {
      vi.useRealTimers();
    }
  }

  it('normalizes a queued WAV filename without transcoding', async () => {
    const [file, , , , , metadata] = await syncAudio('audio/wav', 'continued.webm');
    expect(file.name).toBe('continued.wav');
    expect(file.type).toBe('audio/wav');
    expect(mocks.convertToWavWithFFmpeg).not.toHaveBeenCalled();
    expect(metadata.recording_settings).toMatchObject({ mime_type: file.type });
    expect(metadata.recording_settings).not.toHaveProperty('codec');
  });

  it('updates queued metadata after conversion and keeps consent and source MIME', async () => {
    mocks.convertToWavWithFFmpeg.mockImplementationOnce((file: File, options) => {
      options.onMetadata?.({ convertedToWav: true });
      return Promise.resolve(new File([file], 'recording.wav', { type: 'audio/wav' }));
    });
    const [file, , , , , metadata] = await syncAudio('audio/webm', 'recording.webm');
    expect(file.type).toBe('audio/wav');
    expect(metadata.recording_settings).toMatchObject({
      mime_type: 'audio/wav', source_mime_type: 'audio/webm',
      codec: 'pcm_s16le', sample_rate_hz: 16000, channels: 1,
    });
    expect(metadata.recording_consent.accepted).toBe(true);
  });

  it('preserves original WebM format when conversion returns the original', async () => {
    mocks.convertToWavWithFFmpeg.mockImplementationOnce((file: File) => Promise.resolve(file));
    const [file, , , , , metadata] = await syncAudio('audio/webm', 'recording.wav');
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm');
    expect(metadata.recording_settings).toMatchObject({ mime_type: file.type });
    expect(metadata.recording_settings).not.toHaveProperty('codec');
  });
});
