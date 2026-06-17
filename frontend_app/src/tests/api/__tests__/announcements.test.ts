/**
 * Announcements API Unit Tests
 *
 * Tests the announcements API client functions using MSW to mock backend responses.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, delay, http } from 'msw';
import { TEST_API_BASE } from '../../apiPaths';
import type {
  Announcement,
  AnnouncementCreate,
  AnnouncementUpdate,
} from '@/features/announcements/data/types';
import { PermissionLevel } from '@/types/permissions';
import {
  createAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
  fetchAdminAnnouncements,
  fetchAnnouncements,
  markAnnouncementAsRead,
  updateAnnouncement,
} from '@/features/announcements/data/api';

const API_BASE = TEST_API_BASE;
const VALID_PERMISSION_LEVELS = new Set<string>(Object.values(PermissionLevel));

// Mock announcement data
const mockAnnouncement: Announcement = {
  id: 'ann-1',
  title: 'Test Announcement',
  body: 'This is a test announcement body.',
  created_at: '2026-02-10T12:00:00Z',
  updated_at: '2026-02-10T12:00:00Z',
  created_by: 'admin-user',
  is_active: true,
  priority: 'normal',
  read_by: [],
};

const mockAnnouncement2: Announcement = {
  id: 'ann-2',
  title: 'Second Announcement',
  body: 'Second announcement body.',
  created_at: '2026-02-11T12:00:00Z',
  updated_at: '2026-02-11T12:00:00Z',
  created_by: 'admin-user',
  is_active: true,
  priority: 'high',
  read_by: ['user-1'],
};

// MSW handlers for the tests
const handlers = [
  // User-facing announcements list
  http.get(new RegExp(`${API_BASE}/announcements$`), async () => {
    await delay(10);
    return HttpResponse.json({
      status: 'success',
      announcements: [mockAnnouncement, mockAnnouncement2],
    });
  }),

  // Admin announcements list with pagination
  http.get(new RegExp(`${API_BASE}/admin/announcements$`), async ({ request }) => {
    await delay(10);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return HttpResponse.json({
      status: 'success',
      items: [mockAnnouncement, mockAnnouncement2],
      total: 2,
      limit,
      offset,
    });
  }),

  // Create admin announcement
  http.post(new RegExp(`${API_BASE}/admin/announcements$`), async ({ request }) => {
    await delay(10);
    const body = (await request.json()) as Record<string, unknown>;

    // If client sent numeric priority (production mapping), translate back
    const PRIORITY_LABEL_MAP: Record<number, string> = {
      1: 'low',
      5: 'normal',
      8: 'high',
      10: 'critical',
    };
    const rawPriority = body.priority;
    const priorityLabel =
      typeof rawPriority === 'number'
        ? (PRIORITY_LABEL_MAP[rawPriority] ?? String(rawPriority))
        : typeof rawPriority === 'string'
          ? rawPriority
          : 'normal';

    const newAnnouncement: Announcement = {
      id: 'ann-new',
      title: typeof body.title === 'string' ? body.title : '',
      body: typeof body.body === 'string' ? body.body : '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'admin-user',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
      priority: priorityLabel as any,
      read_by: [],
      expires_at: typeof body.expires_at === 'string' ? body.expires_at : undefined,
      target_permissions: Array.isArray(body.target_permissions)
        ? body.target_permissions.filter(
            (value): value is PermissionLevel =>
              typeof value === 'string' && VALID_PERMISSION_LEVELS.has(value)
          )
        : undefined,
    };
    return HttpResponse.json(
      { status: 'success', announcement: newAnnouncement },
      { status: 201 }
    );
  }),

  // Update admin announcement
  http.put(new RegExp(`${API_BASE}/admin/announcements/[^/]+$`), async ({ request, params }) => {
    await delay(10);
    const body = (await request.json()) as Record<string, unknown>;

    const PRIORITY_LABEL_MAP: Record<number, string> = {
      1: 'low',
      5: 'normal',
      8: 'high',
      10: 'critical',
    };

    const normalizedBody: Record<string, unknown> = { ...body };
    const rawPriority = normalizedBody.priority;
    if (typeof rawPriority === 'number') {
      normalizedBody.priority = PRIORITY_LABEL_MAP[rawPriority] ?? String(rawPriority);
    }

    const updatedAnnouncement: Announcement = {
      ...mockAnnouncement,
      ...normalizedBody,
      id: (params as any).id || mockAnnouncement.id,
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json({ status: 'success', announcement: updatedAnnouncement });
  }),

  // Delete admin announcement
  http.delete(new RegExp(`${API_BASE}/admin/announcements/[^/]+$`), async () => {
    await delay(10);
    return HttpResponse.json({ status: 'success', message: 'Announcement deleted' });
  }),

  // Dismiss announcement
  http.post(new RegExp(`${API_BASE}/announcements/[^/]+/dismiss$`), async () => {
    await delay(10);
    return HttpResponse.json({ status: 'success' });
  }),

  // Mark announcement as read
  http.post(new RegExp(`${API_BASE}/announcements/[^/]+/read$`), async () => {
    await delay(10);
    return HttpResponse.json({ status: 'success' });
  }),
];

// Setup MSW server
const server = setupServer(...handlers);

describe('Announcements API', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  describe('fetchAnnouncements', () => {
    it('should fetch active announcements for users', async () => {
      const announcements = await fetchAnnouncements();

      expect(announcements).toHaveLength(2);
      expect(announcements[0].title).toBe('Test Announcement');
      expect(announcements[1].title).toBe('Second Announcement');
    });

    it('should return items with correct structure', async () => {
      const announcements = await fetchAnnouncements();
      const announcement = announcements[0];

      expect(announcement).toHaveProperty('id');
      expect(announcement).toHaveProperty('title');
      expect(announcement).toHaveProperty('body');
      expect(announcement).toHaveProperty('created_at');
      expect(announcement).toHaveProperty('updated_at');
      expect(announcement).toHaveProperty('is_active');
      expect(announcement).toHaveProperty('priority');
      expect(announcement).toHaveProperty('read_by');
    });
  });

  describe('fetchAdminAnnouncements', () => {
    it('should fetch all announcements for admin with pagination', async () => {
      const response = await fetchAdminAnnouncements();

      expect(response.items).toHaveLength(2);
      expect(response.total).toBe(2);
      expect(response.status).toBe('success');
    });

    it('should support pagination params', async () => {
      const response = await fetchAdminAnnouncements(10, 5);

      expect(response.limit).toBe(10);
      expect(response.offset).toBe(5);
    });
  });

  describe('createAnnouncement', () => {
    it('should create a new announcement', async () => {
      const newAnnouncement: AnnouncementCreate = {
        title: 'New Announcement',
        body: 'This is a new announcement.',
        priority: 'high',
        is_active: true,
      };

      const result = await createAnnouncement(newAnnouncement);

      expect(result.id).toBe('ann-new');
      expect(result.title).toBe('New Announcement');
      expect(result.body).toBe('This is a new announcement.');
      expect(result.priority).toBe('high');
      expect(result.is_active).toBe(true);
    });

    it('should handle optional fields', async () => {
      const minimalAnnouncement: AnnouncementCreate = {
        title: 'Minimal',
        body: 'Minimal body',
      };

      const result = await createAnnouncement(minimalAnnouncement);

      expect(result.title).toBe('Minimal');
      expect(result.is_active).toBe(true); // Default value
    });
  });

  describe('updateAnnouncement', () => {
    it('should update an existing announcement', async () => {
      const update: AnnouncementUpdate = {
        title: 'Updated Title',
        body: 'Updated body content',
      };

      const result = await updateAnnouncement('ann-1', update);

      expect(result.title).toBe('Updated Title');
      expect(result.body).toBe('Updated body content');
    });

    it('should handle partial updates', async () => {
      const partialUpdate: AnnouncementUpdate = {
        is_active: false,
      };

      const result = await updateAnnouncement('ann-1', partialUpdate);

      expect(result.is_active).toBe(false);
    });
  });

  describe('deleteAnnouncement', () => {
    it('should delete an announcement', async () => {
      const result = await deleteAnnouncement('ann-1');

      expect(result.status).toBe('success');
      expect(result.message).toBe('Announcement deleted');
    });
  });

  describe('dismissAnnouncement', () => {
    it('should dismiss an announcement for the current user', async () => {
      const result = await dismissAnnouncement('ann-1');

      expect(result.status).toBe('success');
    });
  });

  describe('markAnnouncementAsRead', () => {
    it('should mark an announcement as read for the current user', async () => {
      const result = await markAnnouncementAsRead('ann-1');

      expect(result.status).toBe('success');
    });
  });

  describe('error handling', () => {
    it('should handle 404 errors gracefully', async () => {
      server.use(
        http.get(new RegExp(`${API_BASE}/announcements$`), () => {
          return HttpResponse.json(
            { message: 'Not found' },
            { status: 404 }
          );
        })
      );

      await expect(fetchAnnouncements()).rejects.toThrow();
    });

    it('should handle 500 errors', async () => {
      server.use(
        http.post(new RegExp(`${API_BASE}/admin/announcements$`), () => {
          return HttpResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          );
        })
      );

      await expect(
        createAnnouncement({ title: 'Test', body: 'Test body' })
      ).rejects.toThrow();
    });
  });
});
