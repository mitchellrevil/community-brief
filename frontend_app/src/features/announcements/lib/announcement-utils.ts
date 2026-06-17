import type { Announcement, AnnouncementPriority } from '../data/types';
import { parseDate } from '@/lib/date-utils';

export const PRIORITY_TO_INT: Record<AnnouncementPriority, number> = {
  low: 1,
  normal: 5,
  high: 8,
  critical: 10,
};

const INT_TO_PRIORITY: Array<[number, AnnouncementPriority]> = [
  [9, 'critical'],
  [7, 'high'],
  [3, 'normal'],
  [0, 'low'],
];

type RawAnnouncement = Partial<Announcement> & {
  priority?: unknown;
  message?: unknown;
  body?: unknown;
  target_service_areas?: unknown;
  target_business_unit_ids?: unknown;
};

export function normalizePriority(value: unknown): AnnouncementPriority {
  if (
    value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'critical'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    return INT_TO_PRIORITY.find(([min]) => value >= min)?.[1] ?? 'normal';
  }

  return 'normal';
}

export function getAnnouncementBody(announcement: Pick<Announcement, 'body'> & {
  message?: unknown;
}): string {
  if (typeof announcement.body === 'string' && announcement.body.trim()) {
    return announcement.body;
  }

  if (typeof announcement.message === 'string') {
    return announcement.message;
  }

  return '';
}

export function normalizeAnnouncement(raw: RawAnnouncement): Announcement {
  const body =
    typeof raw.body === 'string'
      ? raw.body
      : typeof raw.message === 'string'
        ? raw.message
        : '';

  const targetServiceAreas = Array.isArray(raw.target_service_areas)
    ? raw.target_service_areas.filter((item): item is string => typeof item === 'string')
    : undefined;

  return {
    ...raw,
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    body,
    message: typeof raw.message === 'string' ? raw.message : body,
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? '',
    created_by: String(raw.created_by ?? ''),
    is_active: raw.is_active ?? true,
    priority: normalizePriority(raw.priority),
    read_by: Array.isArray(raw.read_by) ? raw.read_by : [],
    target_service_areas: targetServiceAreas,
    target_business_unit_ids: Array.isArray(raw.target_business_unit_ids)
      ? raw.target_business_unit_ids.filter((item): item is string => typeof item === 'string')
      : targetServiceAreas,
  };
}

export function toDateInput(value: string | number | undefined | null): string {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

export function dateInputToEpochMs(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
