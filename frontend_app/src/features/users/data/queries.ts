import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { PaginatedUsersResponse } from "@/features/users/data/api";
import { fetchAllUsers, fetchAllUsersPaginated } from "@/features/users/data/api";

export function getUsersInfiniteQuery(pageSize: number = 50) {
  return infiniteQueryOptions({
    queryKey: ["users", "infinite", pageSize],
    queryFn: ({ pageParam = 0 }) => fetchAllUsersPaginated(pageSize, pageParam),
    getNextPageParam: (lastPage: PaginatedUsersResponse) =>
      lastPage.has_more ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function getUsersQuery() {
  return queryOptions({
    queryKey: ["users-all"],
    queryFn: () => fetchAllUsers(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function getUsersTotalQuery(businessUnitId?: string) {
  return queryOptions({
    queryKey: ["users", "total", businessUnitId || "all"],
    queryFn: () => fetchAllUsersPaginated(1, 0),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

