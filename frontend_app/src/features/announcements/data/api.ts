import { PRIORITY_TO_INT, normalizeAnnouncement } from '../lib/announcement-utils';
import type {
  AdminAnnouncementsResponse,
  Announcement,
  AnnouncementActionResponse,
  AnnouncementCreate,
  AnnouncementResponse,
  AnnouncementUpdate,
  UserAnnouncementsResponse,
} from './types';
import { httpClient } from '@/shared/api/client/httpClient';
import {
  ADMIN_ANNOUNCEMENTS_API,
  ADMIN_ANNOUNCEMENT_BY_ID,
  ANNOUNCEMENTS_API,
  ANNOUNCEMENT_DISMISS_API,
  ANNOUNCEMENT_READ_API,
} from '@/shared/api/constants';

export async function fetchAnnouncements(): Promise<Array<Announcement>> {
  const response = await httpClient.get<UserAnnouncementsResponse>(
    ANNOUNCEMENTS_API
  );
  return response.data.announcements.map(normalizeAnnouncement);
}

export async function fetchAdminAnnouncements(
  limit: number = 50,
  offset: number = 0
): Promise<AdminAnnouncementsResponse> {
  const response = await httpClient.get<AdminAnnouncementsResponse>(
    ADMIN_ANNOUNCEMENTS_API,
    { params: { limit, offset } }
  );
  return {
    ...response.data,
    items: response.data.items.map(normalizeAnnouncement),
  };
}

export async function createAnnouncement(
  data: AnnouncementCreate
): Promise<Announcement> {
  const payload: any = { ...data };

  if (!('message' in payload) && payload.body) {
    payload.message = payload.body;
  }

  if (typeof payload.priority === 'string') {
    const p = payload.priority.toLowerCase();
    if (p in PRIORITY_TO_INT) payload.priority = PRIORITY_TO_INT[p as keyof typeof PRIORITY_TO_INT];
  }

  const response = await httpClient.post<AnnouncementResponse>(
    ADMIN_ANNOUNCEMENTS_API,
    payload
  );
  return normalizeAnnouncement(response.data.announcement);
}

export async function updateAnnouncement(
  announcementId: string,
  data: AnnouncementUpdate
): Promise<Announcement> {
  const payload: any = { ...data };

  if (!('message' in payload) && payload.body) {
    payload.message = payload.body;
  }

  if (typeof payload.priority === 'string') {
    const p = payload.priority.toLowerCase();
    if (p in PRIORITY_TO_INT) payload.priority = PRIORITY_TO_INT[p as keyof typeof PRIORITY_TO_INT];
  }

  const response = await httpClient.put<AnnouncementResponse>(
    ADMIN_ANNOUNCEMENT_BY_ID(announcementId),
    payload
  );
  return normalizeAnnouncement(response.data.announcement);
}

export async function deleteAnnouncement(
  announcementId: string
): Promise<AnnouncementActionResponse> {
  const response = await httpClient.delete(
    ADMIN_ANNOUNCEMENT_BY_ID(announcementId)
  );
  return response.data;
}

export async function dismissAnnouncement(
  announcementId: string
): Promise<AnnouncementActionResponse> {
  const response = await httpClient.post(
    ANNOUNCEMENT_DISMISS_API(announcementId)
  );
  return response.data;
}

export async function markAnnouncementAsRead(
  announcementId: string
): Promise<AnnouncementActionResponse> {
  const response = await httpClient.post(ANNOUNCEMENT_READ_API(announcementId));
  return response.data;
}
