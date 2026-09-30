import { describe, expect, it, vi } from 'vitest';
import { startSync } from './sync-service';

const uploadFile = vi.hoisted(() => vi.fn());
const queuedFile = new File(['WEBVTT\n\n'], 'teams-meeting.vtt', { type: 'text/vtt' });

vi.mock('@/lib/online-status', () => ({ isOnline: () => Promise.resolve(true) }));
vi.mock('@/lib/pwa-queue', () => ({
  getPendingRecordings: () => Promise.resolve([{
    id: 'queued-1',
    blob: queuedFile,
    metadata: {
      categoryId: 'category-1',
      subcategoryId: 'subcategory-1',
      timestamp: 1,
      fileName: queuedFile.name,
    },
  }]),
  getQueuedRecording: () => Promise.resolve({ status: 'uploading' }),
  markRecordingUploading: vi.fn(),
  markRecordingUploaded: vi.fn(),
  markRecordingFailed: vi.fn(),
  getQueuedCount: vi.fn(),
}));
vi.mock('@/features/recordings/data/api', () => ({ uploadFile }));

describe('offline Teams VTT upload', () => {
  it('keeps the VTT filename and content type when syncing', async () => {
    vi.useFakeTimers();
    uploadFile.mockResolvedValue({ job_id: 'job-1' });
    try {
      const sync = startSync();
      await vi.runAllTimersAsync();
      expect((await sync).success).toBe(1);
      const uploadedFile = uploadFile.mock.calls[0][0] as File;
      expect(uploadedFile.name).toBe('teams-meeting.vtt');
      expect(uploadedFile.type).toBe('text/vtt');
      expect(await uploadedFile.text()).toBe('WEBVTT\n\n');
    } finally {
      vi.useRealTimers();
    }
  });
});
