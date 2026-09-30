/**
 * Pagination and infinite scroll hooks for TanStack Query v5.
 *
 * Provides utilities for handling paginated API responses with infinite loading patterns.
 * Designed to work with the backend's offset-based pagination structure.
 *
 * @module hooks/useInfinitePagination
 *
 * @example
 * ```tsx
 * import {
 *   useInfinitePagination,
 *   useInfiniteScroll,
 *   extractItemsFromPaginatedResponse,
 * } from '@/hooks/useInfinitePagination';
 *
 * function UserList() {
 *   const query = useInfinitePagination<PaginatedUsersResponse>({
 *     queryKey: ['users'],
 *     queryFn: ({ pageParam }) => fetchUsers(25, pageParam),
 *     pageSize: 25,
 *   });
 *
 *   const users = query.data?.pages.flatMap(
 *     (page) => extractItemsFromPaginatedResponse(page, 'users')
 *   ) ?? [];
 *
 *   const observerRef = useInfiniteScroll(
 *     query.hasNextPage,
 *     query.isFetchingNextPage,
 *     query.fetchNextPage
 *   );
 *
 *   return (
 *     <div>
 *       {users.map((user) => <UserCard key={user.id} user={user} />)}
 *       <div ref={observerRef} />
 *     </div>
 *   );
 * }
 * ```
 */

import {   useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type {UseInfiniteQueryOptions, UseInfiniteQueryResult} from '@tanstack/react-query';

/**
 * Generic paginated API response structure.
 * Backend responses should conform to this interface.
 */
export interface PaginatedResponse<T> {
  /** Array of items (generic fallback field) */
  items?: Array<T>;
  /** Total count of all items */
  total: number;
  /** Number of items requested */
  limit: number;
  /** Starting offset */
  offset: number;
  /** Whether more pages are available */
  has_more: boolean;
  // Specific response types can extend this
}

/**
 * Categories-specific paginated response.
 */
export interface PaginatedCategoriesResponse extends PaginatedResponse<any> {
  categories: Array<any>;
}

/**
 * Subcategories-specific paginated response.
 */
export interface PaginatedSubcategoriesResponse extends PaginatedResponse<any> {
  subcategories: Array<any>;
}

/**
 * Users-specific paginated response.
 */
export interface PaginatedUsersResponse extends PaginatedResponse<any> {
  users: Array<any>;
  status?: number;
}

/**
 * Generic hook for infinite scroll queries.
 *
 * Automatically calculates offset based on page index and page size.
 * Wraps TanStack Query's useInfiniteQuery with sensible defaults.
 *
 * @template T - Paginated response type extending PaginatedResponse
 * @param {Object} options - TanStack Query infinite query options
 * @param {number} [options.pageSize] - Items per page
 *
 * @returns TanStack Query infinite query result
 *
 * @example
 * ```tsx
 * import { useInfinitePagination } from '@/hooks/useInfinitePagination';
 *
 * const query = useInfinitePagination<PaginatedCategoriesResponse>({
 *   queryKey: ['categories'],
 *   queryFn: ({ pageParam = 0 }) => fetchCategories(25, pageParam),
 *   pageSize: 25,
 * });
 * ```
 */
export function useInfinitePagination<T extends PaginatedResponse<any>>(
  options: Omit<UseInfiniteQueryOptions<T, Error>, "getNextPageParam"> & {
    pageSize?: number;
    getNextPageParam?: (lastPage: T) => number | undefined;
  }
): UseInfiniteQueryResult<T, Error> {
  const getNextPageParam = options.getNextPageParam ?? ((lastPage: T) => {
    // Default behavior: if has_more is true, return next offset
    return lastPage.has_more ? lastPage.offset + lastPage.limit : undefined;
  });

  return useInfiniteQuery({
    ...options,
    getNextPageParam,
    initialPageParam: 0,
  } as UseInfiniteQueryOptions<T, Error>);
}

/**
 * Hook for managing infinite scroll with IntersectionObserver.
 *
 * Automatically loads the next page when the sentinel element becomes visible.
 * Returns a ref to attach to a "load more" trigger element.
 *
 * @param {boolean | undefined} hasNextPage - Whether more pages are available
 * @param {boolean} isFetchingNextPage - Whether currently fetching
 * @param {() => void} fetchNextPage - Function to fetch the next page
 * @param {Object} [options] - IntersectionObserver options
 * @param {string} [options.rootMargin='100px'] - Trigger margin
 * @param {number | Array<number>} [options.threshold=0.1] - Visibility threshold
 *
 * @returns {React.RefObject<HTMLDivElement>} Ref to attach to sentinel element
 *
 * @example
 * ```tsx
 * import { useInfiniteScroll } from '@/hooks/useInfinitePagination';
 *
 * function InfiniteList() {
 *   const { hasNextPage, isFetchingNextPage, fetchNextPage } = useQuery(...);
 *
 *   const observerTarget = useInfiniteScroll(
 *     hasNextPage,
 *     isFetchingNextPage,
 *     fetchNextPage,
 *     { rootMargin: '200px' }
 *   );
 *
 *   return (
 *     <div>
 *       {items.map((item) => <Item key={item.id} item={item} />)}
 *       {// Sentinel element - triggers load when visible}
 *       <div ref={observerTarget} className="h-4" />
 *       {isFetchingNextPage && <Spinner />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useInfiniteScroll(
  hasNextPage: boolean | undefined,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
  options?: {
    rootMargin?: string;
    threshold?: number | Array<number>;
  }
) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!observerTarget.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        rootMargin: options?.rootMargin || '100px',
        threshold: options?.threshold || 0.1,
      }
    );

    observer.observe(observerTarget.current);

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, options]);

  return observerTarget;
}

/**
 * Extract items from various paginated response formats.
 *
 * Handles different API response shapes by checking common field names.
 * Falls back to checking custom itemKey or treating response as array.
 *
 * @template T - Item type
 * @param {PaginatedResponse<T> | any} response - Paginated API response
 * @param {string} [itemKey] - Custom key to extract items from
 *
 * @returns {Array<T>} Extracted items array
 *
 * @example
 * ```tsx
 * import { extractItemsFromPaginatedResponse } from '@/hooks/useInfinitePagination';
 *
 * // Automatically detects 'users' field
 * const users = extractItemsFromPaginatedResponse(usersResponse);
 *
 * // With custom key
 * const items = extractItemsFromPaginatedResponse(response, 'recordings');
 * ```
 */
export function extractItemsFromPaginatedResponse<T>(
  response: PaginatedResponse<T> | any,
  itemKey?: string
): Array<T> {
  if (!response) return [];

  // Try specific known keys first
  if ('categories' in response) return response.categories;
  if ('subcategories' in response) return response.subcategories;
  if ('users' in response) return response.users;
  if ('items' in response) return response.items;

  // If itemKey is provided, use that
  if (itemKey && itemKey in response) return response[itemKey];

  // Fallback to direct array if response is an array
  if (Array.isArray(response)) return response;

  return [];
}

/**
 * Calculate next offset for pagination
 */
export function getNextOffset(currentOffset: number, pageSize: number, total: number): number | undefined {
  const nextOffset = currentOffset + pageSize;
  return nextOffset < total ? nextOffset : undefined;
}

/**
 * Check if more pages are available
 */
export function hasMorePages(offset: number, limit: number, total: number): boolean {
  return offset + limit < total;
}

/**
 * Format pagination info for display
 */
export function formatPaginationInfo(
  currentItems: number,
  offset: number,
  total: number
): string {
  const endItem = offset + currentItems;
  return `Showing ${offset + 1} - ${endItem} of ${total}`;
}
