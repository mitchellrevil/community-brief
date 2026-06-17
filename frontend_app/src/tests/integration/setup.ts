/**
 * Integration Test Setup with MSW
 * 
 * Provides MSW server configuration and helpers for integration tests.
 * Uses handlers from src/tests/mocks/handlers.ts and extends as needed.
 */

import { setupServer } from 'msw/node';
import { HttpResponse, delay, http } from 'msw';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { TEST_API_BASE } from '../apiPaths';
import { errorHandlers, handlers, mockData } from '../mocks/handlers';

/**
 * MSW server instance configured with default handlers
 */
export const server = setupServer(...handlers);

/**
 * Standard MSW lifecycle hooks for tests
 * Call these in your test file or import setupIntegrationTest
 */
export function setupMSWHooks() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });
}

/**
 * Base API URL for mock handlers
 */
const API_BASE = TEST_API_BASE;

/**
 * Extended handlers for integration test scenarios
 */
export const integrationHandlers = {
  /**
   * Upload flow handlers with realistic multi-step workflow
   */
  uploadComplete: {
    /**
     * Simulates complete upload lifecycle:
     * 1. Request token → returns SAS URL
     * 2. Complete upload → returns job in processing state
     * 3. Job status poll → returns completed job
     */
    success: (jobId: string = 'test-job-123') => [
      http.post(`${API_BASE}/upload/request-token`, async () => {
        await delay(50);
        return HttpResponse.json({
          job_id: jobId,
          sas_url: 'https://example.blob.core.windows.net/uploads/test-file?sv=2021-04-10&sas=token',
          container_name: 'uploads',
          blob_name: 'test-file.mp3',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        });
      }),

      http.post(`${API_BASE}/upload/complete`, async () => {
        await delay(50);
        return HttpResponse.json({
          message: 'Upload completed successfully',
          job_id: jobId,
          status: 'processing',
        });
      }),

      http.get(`${API_BASE}/jobs/${jobId}`, async () => {
        await delay(30);
        return HttpResponse.json(mockData.job({
          id: jobId,
          status: 'completed',
          title: 'Uploaded Recording',
        }));
      }),
    ],

    /**
     * Simulates upload failure with 500 error
     */
    serverError: () => [
      http.post(`${API_BASE}/upload/request-token`, async () => {
        await delay(50);
        return HttpResponse.json(
          { message: 'Internal server error', detail: 'Storage service unavailable' },
          { status: 500 }
        );
      }),
    ],

    /**
     * Simulates upload with retry (first fails, second succeeds)
     */
    withRetry: (jobId: string = 'retry-job-123') => {
      let attempts = 0;
      return [
        http.post(`${API_BASE}/upload/request-token`, async () => {
          attempts++;
          await delay(50);
          if (attempts === 1) {
            return HttpResponse.json(
              { message: 'Service temporarily unavailable' },
              { status: 503 }
            );
          }
          return HttpResponse.json({
            job_id: jobId,
            sas_url: 'https://example.blob.core.windows.net/uploads/test-file?sas=token',
            container_name: 'uploads',
            blob_name: 'test-file.mp3',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          });
        }),
      ];
    },
  },

  /**
   * Recording detail handlers
   */
  recordingDetail: {
    /**
     * Full recording with transcript and analysis
     */
    complete: (jobId: string = 'detail-job-123') => [
      http.get(`${API_BASE}/jobs/${jobId}`, async () => {
        await delay(30);
        return HttpResponse.json(mockData.job({
          id: jobId,
          status: 'completed',
          title: 'Complete Recording',
          analysis_text: 'This is the AI-generated analysis of the recording.',
          transcription_file_path: '/transcripts/test.txt',
          analysis_file_path: '/analysis/test.md',
          file_path: 'https://example.blob.core.windows.net/audio/test.mp3',
        }));
      }),

      http.get(`${API_BASE}/jobs/${jobId}/transcription`, async () => {
        await delay(30);
        return HttpResponse.json({
          transcription: 'This is the full transcription of the audio recording.',
          segments: [
            { start: 0, end: 5, text: 'This is the beginning.' },
            { start: 5, end: 10, text: 'This is the middle part.' },
            { start: 10, end: 15, text: 'This is the end of the recording.' },
          ],
        });
      }),
    ],

    /**
     * Reprocess endpoint that returns processing state
     */
    reprocess: (jobId: string = 'detail-job-123') => [
      http.post(`${API_BASE}/jobs/${jobId}/reprocess`, async () => {
        await delay(50);
        return HttpResponse.json({
          message: 'Job reprocessing started',
          job_id: jobId,
          status: 'analysing',
        });
      }),

      // Return updated job status after reprocess
      http.get(`${API_BASE}/jobs/${jobId}`, async () => {
        await delay(30);
        return HttpResponse.json(mockData.job({
          id: jobId,
          status: 'analysing',
          title: 'Reprocessing Recording',
          analysis_in_progress: true,
        }));
      }),
    ],
  },

  /**
   * Admin user management handlers
   */
  adminUsers: {
    /**
     * User list for admin view
     */
    list: () => [
      http.get(`${API_BASE}/auth/users`, async () => {
        await delay(30);
        return HttpResponse.json({
          users: [
            mockData.user({ user_id: 'user-1', email: 'admin@example.com', permission: 'Admin' }),
            mockData.user({ user_id: 'user-2', email: 'editor@example.com', permission: 'Editor' }),
            mockData.user({ user_id: 'user-3', email: 'regular@example.com', permission: 'User' }),
          ],
          total: 3,
        });
      }),
    ],

    /**
     * Get single user and update permission
     */
    updatePermission: (userId: string = 'user-3') => [
      http.get(`${API_BASE}/auth/users/${userId}`, async () => {
        await delay(30);
        return HttpResponse.json(mockData.user({
          user_id: userId,
          email: 'regular@example.com',
          permission: 'User',
        }));
      }),

      http.put(`${API_BASE}/auth/users/${userId}/permission`, async ({ request }) => {
        await delay(50);
        const body = await request.json() as { permission: string };
        return HttpResponse.json({
          message: 'Permission updated successfully',
          user_id: userId,
          permission: body.permission,
        });
      }),

      // Updated user after permission change
      http.get(`${API_BASE}/user/${userId}`, async () => {
        await delay(30);
        return HttpResponse.json(mockData.user({
          user_id: userId,
          email: 'regular@example.com',
          permission: 'Editor',
        }));
      }),
    ],
  },

  /**
   * Prompt management handlers
   */
  prompts: {
    /**
     * Categories and subcategories for prompt management
     */
    list: () => [
      http.get(`${API_BASE}/prompts/categories`, async () => {
        await delay(30);
        return HttpResponse.json({
          categories: [
            mockData.category({ id: 'cat-1', name: 'Meetings' }),
            mockData.category({ id: 'cat-2', name: 'Reports' }),
          ],
        });
      }),

      http.get(`${API_BASE}/prompts/subcategories`, async () => {
        await delay(30);
        return HttpResponse.json({
          subcategories: [
            {
              id: 'sub-1',
              subcategory_name: 'Team Standup',
              category_id: 'cat-1',
              prompts: { default: 'Analyze this team standup meeting...' },
            },
            {
              id: 'sub-2',
              subcategory_name: 'Client Call',
              category_id: 'cat-1',
              prompts: { default: 'Summarize this client call...' },
            },
          ],
        });
      }),
    ],

    /**
     * Create new prompt (subcategory)
     */
    create: () => [
      http.post(`${API_BASE}/prompts/subcategories`, async ({ request }) => {
        await delay(50);
        const body = await request.json() as { name: string; category_id: string };
        return HttpResponse.json({
          id: `sub-new-${Date.now()}`,
          subcategory_name: body.name,
          category_id: body.category_id,
          prompts: { default: 'Enter your prompt content here...' },
        });
      }),
    ],

    /**
     * Assign prompt to category (move)
     */
    move: (promptId: string = 'sub-1', newCategoryId: string = 'cat-2') => [
      http.put(`${API_BASE}/prompts/subcategories/${promptId}/move`, async () => {
        await delay(50);
        return HttpResponse.json({
          id: promptId,
          category_id: newCategoryId,
          message: 'Prompt moved successfully',
        });
      }),
    ],
  },
};

/**
 * Helper to add handlers to the server for a specific test
 */
export function useHandlers(...handlerSets: Array<Array<ReturnType<typeof http.get>>>) {
  handlerSets.forEach(handlerSet => {
    server.use(...handlerSet);
  });
}

/**
 * Re-export mock data and error handlers for convenience
 */
export { mockData, errorHandlers };
