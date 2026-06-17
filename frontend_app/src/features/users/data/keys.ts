export const usersKeys = {
  root: () => ["users"] as const,

  // All users (non-paginated)
  all: () => ["users-all"] as const,

  // Paginated / infinite users
  list: (pageSize = 50) => ["users", "infinite", pageSize] as const,
  total: (businessUnitId?: string) => ["users", "total", businessUnitId ?? "all"] as const,

  // Search (paginated, infinite)
  search: (query = "") => ["users", "search", query] as const,

  // Single user detail
  user: (id: string) => ["user", id] as const,
};

export type UsersKeyFactory = typeof usersKeys;
