export const announcementKeys = {
  all: ['announcements'] as const,
  list: () => [...announcementKeys.all, 'list'] as const,
  adminRoot: () => [...announcementKeys.all, 'admin'] as const,
  admin: (limit?: number, offset?: number) =>
    [...announcementKeys.adminRoot(), { limit, offset }] as const,
  adminTable: (
    limit: number,
    offset: number,
    filterActive: 'all' | 'active' | 'inactive',
    filterPriority: string
  ) =>
    [
      ...announcementKeys.adminRoot(),
      'table',
      limit,
      offset,
      filterActive,
      filterPriority,
    ] as const,
  detail: (id: string) => [...announcementKeys.all, 'detail', id] as const,
};
