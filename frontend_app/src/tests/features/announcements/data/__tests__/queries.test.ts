import { describe, expect, it } from 'vitest';
import { announcementKeys } from '@/features/announcements/data/keys';
import {
  getAdminAnnouncementsQuery,
  getAnnouncementsQuery,
} from '@/features/announcements/data/queries';

describe('announcements feature query contracts', () => {
  it('preserves announcement key shapes', () => {
    expect(announcementKeys.all).toEqual(['announcements']);
    expect(announcementKeys.list()).toEqual(['announcements', 'list']);
    expect(announcementKeys.admin(50, 0)).toEqual([
      'announcements',
      'admin',
      { limit: 50, offset: 0 },
    ]);
    expect(announcementKeys.detail('ann-1')).toEqual([
      'announcements',
      'detail',
      'ann-1',
    ]);
  });

  it('preserves query option signatures', () => {
    const userQuery = getAnnouncementsQuery();
    const adminQuery = getAdminAnnouncementsQuery(25, 10);

    expect(userQuery.queryKey).toEqual(['announcements', 'list']);
    expect(typeof userQuery.queryFn).toBe('function');

    expect(adminQuery.queryKey).toEqual([
      'announcements',
      'admin',
      { limit: 25, offset: 10 },
    ]);
    expect(typeof adminQuery.queryFn).toBe('function');
  });
});
