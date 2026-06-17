/* eslint-disable @typescript-eslint/require-await */
import { HttpResponse, delay, http } from 'msw';
import { TEST_API_BASE } from '../apiPaths';

/**
 * Base API URL for mock handlers
 * Uses relative paths to work with both development and test environments
 */
const API_BASE = TEST_API_BASE;
// Origin used by jsdom in the test environment (credentialed requests require exact origin)
const TEST_ORIGIN = 'http://localhost:3000';

/**
 * Announcements handlers (default mocks for tests)
 */
const announcementHandlers = [
  // Generic OPTIONS handler for versioned API requests to satisfy XHR preflight in jsdom
  http.options(new RegExp(`^${API_BASE}(/.*)?$`), async () => {
    return HttpResponse.json({}, { status: 204, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Public announcements list (non-admin)
  http.get(`${API_BASE}/announcements`, async () => {
    await delay(10);
    return HttpResponse.json({
      items: [
        {
          id: 'a1',
          title: 'Announcement One',
          body: 'First announcement',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          read_by: ['test-user-id'],
        },
        {
          id: 'a2',
          title: 'Announcement Two',
          body: 'Second announcement',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          read_by: [],
        },
      ],
      total: 2,
    }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Absolute-URL variant to match axios baseURL.
  http.get(new RegExp(`^https?://.*${API_BASE}/announcements(\\?.*)?$`), async () => {
    await delay(10);
    return HttpResponse.json({
      items: [
        { id: 'a1', title: 'Announcement One', body: 'First announcement', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), read_by: ['test-user-id'] },
        { id: 'a2', title: 'Announcement Two', body: 'Second announcement', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), read_by: [] },
      ],
      total: 2,
    }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Admin announcements listing (supports query params)
  http.get(`${API_BASE}/admin/announcements`, async () => {
    await delay(10);
    return HttpResponse.json({ status: 'success', items: [
      { id: 'a1', title: 'One', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'a2', title: 'Two', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ], total: 2 }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Absolute-URL variant for admin announcements
  http.get(new RegExp(`^https?://.*${API_BASE}/admin/announcements(\\?.*)?$`), async () => {
    await delay(10);
    return HttpResponse.json({ status: 'success', items: [
      { id: 'a1', title: 'One', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'a2', title: 'Two', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ], total: 2 }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Dismiss an announcement
  http.post<{ announcementId: string }>(`${API_BASE}/announcements/:announcementId/dismiss`, async () => {
    await delay(5);
    return HttpResponse.json({ status: 'success' }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Absolute-URL variant for dismiss
  http.post(new RegExp(`^https?://.*${API_BASE}/announcements/[^/]+/dismiss$`), async () => {
    await delay(5);
    return HttpResponse.json({ status: 'success' }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Mark announcement as read
  http.post<{ announcementId: string }>(`${API_BASE}/announcements/:announcementId/read`, async () => {
    await delay(5);
    return HttpResponse.json({ status: 'success' }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Absolute-URL variant for read
  http.post(new RegExp(`^https?://.*${API_BASE}/announcements/[^/]+/read$`), async () => {
    await delay(5);
    return HttpResponse.json({ status: 'success' }, { status: 200, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Admin create announcement
  http.post(`${API_BASE}/admin/announcements`, async ({ request }) => {
    await delay(5);
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...body, id: 'new-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),

  // Absolute-URL variant for create
  http.post(new RegExp(`^https?://.*${API_BASE}/admin/announcements$`), async ({ request }) => {
    await delay(5);
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...body, id: 'new-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201, headers: { 'Access-Control-Allow-Origin': TEST_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Credentials': 'true' } });
  }),
];

/**
 * Mock data generators for consistent test data
 */
export const mockData = {
  user: (overrides = {}) => ({
    user_id: 'test-user-id',
    email: 'test@example.com',
    permission: 'User',
    business_unit_ids: [],
    business_unit_names: [],
    ...overrides,
  }),

  job: (overrides = {}) => ({
    id: 'test-job-id',
    user_id: 'test-user-id',
    status: 'completed',
    title: 'Test Recording',
    original_filename: 'test-recording.mp3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    duration_seconds: 120,
    analysis_result: 'Test analysis content',
    transcription: 'Test transcription content',
    ...overrides,
  }),

  recording: (overrides = {}) => ({
    id: 'test-recording-id',
    user_id: 'test-user-id',
    title: 'Test Recording',
    status: 'completed',
    created_at: new Date().toISOString(),
    ...overrides,
  }),

  prompt: (overrides = {}) => ({
    id: 'test-prompt-id',
    name: 'Test Prompt',
    content: 'This is a test prompt template',
    category_id: 'test-category-id',
    subcategory_id: 'test-subcategory-id',
    is_active: true,
    ...overrides,
  }),

  category: (overrides = {}) => ({
    id: 'test-category-id',
    name: 'Test Category',
    description: 'Test category description',
    subcategories: [],
    ...overrides,
  }),

  businessUnit: (overrides = {}) => ({
    id: 'test-unit-id',
    name: 'Test Business Unit',
    description: 'Test unit description',
    ...overrides,
  }),

  uploadToken: () => ({
    job_id: `job-${Date.now()}`,
    sas_url: 'https://example.blob.core.windows.net/uploads/test-file?sv=2021-04-10&sas=token',
    container_name: 'uploads',
    blob_name: 'test-file.mp3',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  }),
};

/**
 * User-related handlers
 */
const userHandlers = [
  // GET /auth/me - Current authenticated session
  http.get(`${API_BASE}/auth/me`, async () => {
    await delay(10);
    return HttpResponse.json({
      status: 200,
      data: mockData.user({ auth_source: 'entra' }),
    });
  }),

  // GET /auth/users/me/permissions - Current user permissions
  http.get(`${API_BASE}/auth/users/me/permissions`, async () => {
    await delay(10);
    return HttpResponse.json(mockData.user());
  }),

  // GET /auth/users - List all users (admin)
  http.get(`${API_BASE}/auth/users`, async () => {
    await delay(10);
    return HttpResponse.json({
      users: [
        mockData.user(),
        mockData.user({ user_id: 'user-2', email: 'user2@example.com' }),
      ],
      total: 2,
    });
  }),

  // GET /auth/users/:userId - Get specific user
  http.get<{ userId: string }>(`${API_BASE}/auth/users/:userId`, async ({ params }) => {
    await delay(10);
    return HttpResponse.json(mockData.user({ user_id: params.userId }));
  }),

  // GET /users - Alternative users endpoint
  http.get(`${API_BASE}/users`, async () => {
    await delay(10);
    return HttpResponse.json({
      users: [mockData.user()],
      total: 1,
    });
  }),
];

/**
 * Job/Recording-related handlers
 */
const jobHandlers = [
  // GET /jobs - List all jobs
  http.get(`${API_BASE}/jobs`, async () => {
    await delay(10);
    return HttpResponse.json({
      jobs: [
        mockData.job(),
        mockData.job({ id: 'job-2', title: 'Second Recording' }),
      ],
      total: 2,
      page: 1,
      page_size: 20,
    });
  }),

  // GET /jobs/:jobId - Get specific job
  http.get<{ jobId: string }>(`${API_BASE}/jobs/:jobId`, async ({ params }) => {
    await delay(10);
    return HttpResponse.json(mockData.job({ id: params.jobId }));
  }),

  // GET /jobs/:jobId/transcription - Get job transcription
  http.get(`${API_BASE}/jobs/:jobId/transcription`, async () => {
    await delay(10);
    return HttpResponse.json({
      transcription: 'This is the test transcription content.',
      segments: [],
    });
  }),

  // POST /jobs/:jobId/reprocess - Reprocess a job
  http.post<{ jobId: string }>(`${API_BASE}/jobs/:jobId/reprocess`, async ({ params }) => {
    await delay(50);
    return HttpResponse.json({
      message: 'Job reprocessing started',
      job_id: params.jobId,
      status: 'processing',
    });
  }),

  // DELETE /jobs/:jobId - Delete a job
  http.delete<{ jobId: string }>(`${API_BASE}/jobs/:jobId`, async ({ params }) => {
    await delay(10);
    return HttpResponse.json({
      message: 'Job deleted successfully',
      job_id: params.jobId,
    });
  }),

  // GET /jobs/shared - Get shared jobs
  http.get(`${API_BASE}/jobs/shared`, async () => {
    await delay(10);
    return HttpResponse.json({
      jobs: [],
      total: 0,
    });
  }),
];

/**
 * Upload-related handlers
 */
const uploadHandlers = [
  // POST /upload/request-token - Request upload token (SAS URL)
  http.post(`${API_BASE}/upload/request-token`, async () => {
    await delay(20);
    return HttpResponse.json(mockData.uploadToken());
  }),

  // POST /upload/complete - Complete upload
  http.post(`${API_BASE}/upload/complete`, async () => {
    await delay(20);
    return HttpResponse.json({
      message: 'Upload completed successfully',
      job_id: `job-${Date.now()}`,
      status: 'processing',
    });
  }),

  // POST /upload - Direct upload (fallback)
  http.post(`${API_BASE}/upload`, async () => {
    await delay(50);
    return HttpResponse.json({
      job_id: `job-${Date.now()}`,
      status: 'processing',
      message: 'File uploaded successfully',
    });
  }),
];

/**
 * Prompt-related handlers
 */
const promptHandlers = [
  // GET /prompts/retrieve_prompts - Get all prompts
  http.get(`${API_BASE}/prompts/retrieve_prompts`, async () => {
    await delay(10);
    return HttpResponse.json({
      prompts: [
        mockData.prompt(),
        mockData.prompt({ id: 'prompt-2', name: 'Second Prompt' }),
      ],
    });
  }),

  // GET /prompts - Alternative prompts endpoint
  http.get(`${API_BASE}/prompts`, async () => {
    await delay(10);
    return HttpResponse.json({
      prompts: [mockData.prompt()],
    });
  }),

  // GET /prompts/categories - Get categories
  http.get(`${API_BASE}/prompts/categories`, async () => {
    await delay(10);
    return HttpResponse.json({
      categories: [
        mockData.category(),
        mockData.category({ id: 'category-2', name: 'Second Category' }),
      ],
    });
  }),

  // GET /prompts/subcategories - Get subcategories
  http.get(`${API_BASE}/prompts/subcategories`, async () => {
    await delay(10);
    return HttpResponse.json({
      subcategories: [
        { id: 'sub-1', name: 'Subcategory 1', category_id: 'test-category-id' },
      ],
    });
  }),
];

/**
 * Business unit handlers
 */
const businessUnitHandlers = [
  // GET /business-units - List business units
  http.get(`${API_BASE}/business-units`, async () => {
    await delay(10);
    return HttpResponse.json({
      business_units: [
        mockData.businessUnit(),
        mockData.businessUnit({ id: 'unit-2', name: 'Unit 2' }),
      ],
    });
  }),

  // GET /business-units/:unitId - Get specific unit
  http.get<{ unitId: string }>(`${API_BASE}/business-units/:unitId`, async ({ params }) => {
    await delay(10);
    return HttpResponse.json(mockData.businessUnit({ id: params.unitId }));
  }),
];

/**
 * Analytics handlers
 */
const analyticsHandlers = [
  // GET /analytics/dashboard - Dashboard analytics
  http.get(`${API_BASE}/analytics/dashboard`, async () => {
    await delay(10);
    return HttpResponse.json({
      total_recordings: 42,
      total_users: 10,
      total_minutes: 1250,
      active_users_today: 5,
    });
  }),

  // GET /analytics/system - System analytics
  http.get(`${API_BASE}/analytics/system`, async () => {
    await delay(10);
    return HttpResponse.json({
      total_jobs: 100,
      completed_jobs: 95,
      failed_jobs: 5,
      average_processing_time: 45.5,
    });
  }),
];

/**
 * Auth handlers
 */
const authHandlers = [
  // POST /auth/login
  http.post(`${API_BASE}/auth/login`, async () => {
    await delay(50);
    return HttpResponse.json({
      status: 200,
      message: 'Login successful',
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      user: mockData.user(),
    });
  }),

  // POST /auth/logout
  http.post(`${API_BASE}/auth/logout`, async () => {
    await delay(10);
    return HttpResponse.json({
      message: 'Logged out successfully',
    });
  }),

];

/**
 * Health check handlers
 */
const healthHandlers = [
  http.get(`${API_BASE}/health/`, async () => {
    return HttpResponse.json({ status: 'healthy' });
  }),

  http.get(`${API_BASE}/health/ready`, async () => {
    return HttpResponse.json({ status: 'ready' });
  }),

  http.get(`${API_BASE}/system/health`, async () => {
    return HttpResponse.json({ status: 'healthy', timestamp: new Date().toISOString() });
  }),
];

/**
 * All MSW handlers combined.
 * Import this array to set up MSW in your tests.
 * 
 * @example
 * ```ts
 * import { setupServer } from 'msw/node';
 * import { handlers } from './mocks/handlers';
 * 
 * const server = setupServer(...handlers);
 * 
 * beforeAll(() => server.listen());
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 */
export const handlers = [
  ...announcementHandlers,
  ...userHandlers,
  ...jobHandlers,
  ...uploadHandlers,
  ...promptHandlers,
  ...businessUnitHandlers,
  ...analyticsHandlers,
  ...authHandlers,
  ...healthHandlers,
];

/**
 * Fallback handlers to catch absolute-URL requests and OPTIONS preflight
 * in the test environment (jsdom/XHR sometimes produces absolute URLs).
 */
const fallbackHandlers = [
  // Only handle absolute-URL OPTIONS preflight as a last-resort fallback
  http.options(new RegExp(`^https?://.*${API_BASE}(/.*)?$`), async () => {
    return HttpResponse.json({}, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
  }),
];

// Append fallback handlers last so they don't override specific handlers above
handlers.push(...fallbackHandlers as any);

/**
 * Helper to create error response handlers for testing error states
 */
export const errorHandlers = {
  unauthorized: (path: string) =>
    http.get(path, () => {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }),

  forbidden: (path: string) =>
    http.get(path, () => {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 });
    }),

  notFound: (path: string) =>
    http.get(path, () => {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }),

  serverError: (path: string) =>
    http.get(path, () => {
      return HttpResponse.json({ message: 'Internal server error' }, { status: 500 });
    }),

  networkError: (path: string) =>
    http.get(path, () => {
      return HttpResponse.error();
    }),
};

export default handlers;
