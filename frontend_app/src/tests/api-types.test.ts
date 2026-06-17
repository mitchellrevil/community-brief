import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';

import type { AnalyticsRecord, AudioRecording, DeletedJobsAdminResponse, PaginatedResponse, SystemAnalytics } from '@/types/api';
import { httpClient } from '@/shared/api/client/httpClient';
import { getSystemAnalytics } from '@/features/analytics/data/api';
import { getAudioRecordings, getDeletedJobs } from '@/features/recordings/data/api';

// Mock httpClient before importing API modules
vi.mock('@/shared/api/client/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  directBackendClient: {
    post: vi.fn(),
  },
}));

describe('api types - analytics returns SystemAnalytics shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return SystemAnalytics with required fields', async () => {
    const mockAnalyticsRecord: AnalyticsRecord = {
      id: 'rec-123',
      user_id: 'user-456',
      timestamp: '2026-02-09T10:00:00Z',
      job_id: 'job-789',
      email: 'test@example.com',
      type: 'transcription',
      event_type: 'job_completed',
      audio_duration_minutes: 5.5,
    };

    const mockSystemAnalytics: SystemAnalytics = {
      period_days: 30,
      start_date: '2026-01-10T00:00:00Z',
      end_date: '2026-02-09T23:59:59Z',
      active_users: 15,
      peak_active_users: 25,
      analytics: {
        records: [mockAnalyticsRecord],
        users: [
          {
            user_id: 'user-456',
            email: 'test@example.com',
            total_jobs: 42,
            total_minutes: 150.5,
          },
        ],
        total_minutes: 150.5,
        total_jobs: 42,
        active_users: 15,
        total_users: 50,
        peak_active_users: 25,
        prompts: [
          { prompt_id: 'prompt-1', total_jobs: 20, total_minutes: 80 },
        ],
        unique_prompt_count: 5,
        recent_jobs: [],
        overview: {
          total_users: 50,
          active_users: 15,
          total_jobs: 42,
          total_transcription_minutes: 150.5,
          peak_active_users: 25,
        },
        trends: {
          daily_activity: { '2026-02-09': 10 },
          daily_transcription_minutes: { '2026-02-09': 50 },
          daily_active_users: { '2026-02-09': 5 },
          user_growth: { '2026-02-09': 2 },
          job_completion_rate: 95,
        },
        usage: {
          transcription_methods: { upload: 30, text: 12 },
          file_vs_text_ratio: { files: 30, text: 12 },
          peak_hours: { '10': 15, '14': 20 },
        },
      },
    };

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockSystemAnalytics,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const result = await getSystemAnalytics(30);

    expect(result).toBeDefined();
    expect(result.period_days).toBe(30);
    expect(result.start_date).toBe('2026-01-10T00:00:00Z');
    expect(result.end_date).toBe('2026-02-09T23:59:59Z');
    expect(result.analytics).toBeDefined();
    expect(result.analytics.records).toBeInstanceOf(Array);
    expect(result.analytics.total_minutes).toBe(150.5);
    expect(result.analytics.total_jobs).toBe(42);
  });

  it('should have properly typed analytics record fields', async () => {
    const mockRecord: AnalyticsRecord = {
      id: 'rec-test',
      user_id: 'user-test',
      timestamp: '2026-02-09T12:00:00Z',
      audio_duration_minutes: 3.25,
      prompt_category_id: 'cat-1',
      prompt_subcategory_id: 'subcat-1',
    };

    const mockResponse: SystemAnalytics = {
      period_days: 7,
      start_date: '2026-02-02T00:00:00Z',
      end_date: '2026-02-09T23:59:59Z',
      analytics: {
        records: [mockRecord],
        total_minutes: 3.25,
        total_jobs: 1,
      },
    };

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const result = await getSystemAnalytics(7);
    const record = result.analytics.records[0];

    expect(record.id).toBe('rec-test');
    expect(record.user_id).toBe('user-test');
    expect(record.timestamp).toBe('2026-02-09T12:00:00Z');
    expect(record.audio_duration_minutes).toBe(3.25);
  });
});

describe('api types - audio recordings return paginated jobs shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return PaginatedResponse with AudioRecording array', async () => {
    const mockRecording: AudioRecording = {
      id: 'job-123',
      user_id: 'user-456',
      file_path: '/audio/file.mp3',
      transcription_file_path: '/transcripts/file.txt',
      analysis_file_path: '/analysis/file.docx',
      prompt_category_id: 'cat-1',
      prompt_subcategory_id: 'subcat-1',
      status: 'completed',
      transcription_id: 'trans-789',
      created_at: 1707465600,
      updated_at: 1707469200,
      type: 'audio',
      _rid: 'rid-123',
      _self: 'self-123',
      _etag: 'etag-123',
      _attachments: 'attachments-123',
      _ts: 1707469200,
    };

    const mockPaginatedResponse: PaginatedResponse<AudioRecording> = {
      jobs: [mockRecording],
      count: 1,
      status: 200,
    };

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockPaginatedResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const result = await getAudioRecordings({ page: 1, per_page: 10 });

    // Result should be PaginatedResponse shape
    expect(result).toBeDefined();
    expect('jobs' in result).toBe(true);
    const paginatedResult = result as PaginatedResponse<AudioRecording>;
    expect(paginatedResult.jobs).toBeInstanceOf(Array);
    expect(paginatedResult.jobs[0].id).toBe('job-123');
    expect(paginatedResult.jobs[0].status).toBe('completed');
    expect(paginatedResult.count).toBe(1);
  });

  it('should have fully typed AudioRecording fields', async () => {
    const mockRecording: AudioRecording = {
      id: 'job-test',
      user_id: 'user-test',
      file_path: '/audio/test.mp3',
      transcription_file_path: null,
      analysis_file_path: null,
      analysis_attempts: [
        {
          attempt: 1,
          analysis_file_path: '/analysis/attempt1.docx',
          created_at: '2026-02-09T10:00:00Z',
          analysis_instructions: 'Custom instructions',
          prompt_category_id: 'cat-1',
          prompt_subcategory_id: 'subcat-1',
        },
      ],
      analysis_latest_attempt: 1,
      analysis_in_progress: false,
      prompt_category_id: 'cat-1',
      prompt_subcategory_id: 'subcat-1',
      status: 'transcribed',
      transcription_id: null,
      created_at: 1707465600,
      updated_at: 1707469200,
      type: 'audio',
      _rid: 'rid-test',
      _self: 'self-test',
      _etag: 'etag-test',
      _attachments: 'attachments-test',
      _ts: 1707469200,
    };

    vi.mocked(httpClient.get).mockResolvedValue({
      data: { jobs: [mockRecording], count: 1, status: 200 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const result = await getAudioRecordings({ page: 1, per_page: 10 });
    const paginatedResult = result as PaginatedResponse<AudioRecording>;
    const recording = paginatedResult.jobs[0];

    expect(recording.analysis_attempts).toBeDefined();
    expect(recording.analysis_attempts?.[0].attempt).toBe(1);
    expect(recording.analysis_latest_attempt).toBe(1);
    expect(recording.analysis_in_progress).toBe(false);
  });

  it('should type DeletedJobsAdminResponse with AudioRecording array instead of any', async () => {
    const mockDeletedJob: AudioRecording = {
      id: 'deleted-job-1',
      user_id: 'user-123',
      file_path: '/audio/deleted.mp3',
      transcription_file_path: '/transcripts/deleted.txt',
      analysis_file_path: null,
      prompt_category_id: 'cat-1',
      prompt_subcategory_id: 'subcat-1',
      status: 'completed',
      transcription_id: 'trans-del',
      created_at: 1707465600,
      updated_at: 1707469200,
      type: 'audio',
      _rid: 'rid-del',
      _self: 'self-del',
      _etag: 'etag-del',
      _attachments: 'attachments-del',
      _ts: 1707469200,
    };

    const mockDeletedResponse: DeletedJobsAdminResponse = {
      status: 'ok',
      message: 'Retrieved deleted jobs',
      deleted_jobs: [mockDeletedJob],
      jobs: [mockDeletedJob],
      total_count: 1,
      limit: 50,
      offset: 0,
    };

    vi.mocked(httpClient.get).mockResolvedValue({
      data: mockDeletedResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const result = await getDeletedJobs(50, 0);

    expect(result.status).toBe('ok');
    expect(result.deleted_jobs).toBeInstanceOf(Array);
    expect(result.deleted_jobs[0].id).toBe('deleted-job-1');
    expect(result.deleted_jobs[0].status).toBe('completed');
    expect(result.total_count).toBe(1);
  });
});

