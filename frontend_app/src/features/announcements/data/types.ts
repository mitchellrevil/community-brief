import type { PermissionLevel } from '@/types/permissions';

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  message?: string;
  created_at: string | number;
  updated_at: string | number;
  created_by: string;
  is_active: boolean;
  priority: AnnouncementPriority;
  read_by: Array<string>;
  expires_at?: string;
  start_at?: string | number | null;
  end_at?: string | number | null;
  target_permissions?: Array<PermissionLevel>;
  target_business_unit_ids?: Array<string>;
  target_service_areas?: Array<string>;
}

export interface AnnouncementCreate {
  title: string;
  body: string;
  priority?: AnnouncementPriority;
  is_active?: boolean;
  expires_at?: string;
  start_at?: number;
  end_at?: number;
  target_permissions?: Array<PermissionLevel>;
  target_business_unit_ids?: Array<string>;
  target_service_areas?: Array<string>;
}

export interface AnnouncementUpdate {
  title?: string;
  body?: string;
  priority?: AnnouncementPriority;
  is_active?: boolean;
  expires_at?: string;
  start_at?: number;
  end_at?: number;
  target_permissions?: Array<PermissionLevel>;
  target_business_unit_ids?: Array<string>;
  target_service_areas?: Array<string>;
}

export interface UserAnnouncementsResponse {
  status: string;
  announcements: Array<Announcement>;
}

export interface AdminAnnouncementsResponse {
  status: string;
  items: Array<Announcement>;
  total: number;
  limit: number;
  offset: number;
}

export interface AnnouncementResponse {
  status: string;
  announcement: Announcement;
}

export interface AnnouncementActionResponse {
  status: string;
  message?: string;
}
