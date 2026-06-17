import { useInfiniteQuery } from "@tanstack/react-query";
import type { BusinessUnit } from "@/shared/data/business-units/api";
import { getBusinessUnitsInfiniteQuery } from "@/shared/data/business-units/queries";

/**
 * Hook for infinite scrolling through business units.
 *
 * Provides paginated access to business units with automatic page fetching
 * for infinite scroll patterns. Flattens paginated responses into a single
 * array for easy rendering.
 *
 * @description Uses TanStack Query's useInfiniteQuery with cursor-based
 * pagination. Automatically manages page state and provides fetch controls.
 *
 * @param {number} [pageSize=25] - Number of items per page
 *
 * @returns Infinite query result for business units
 * @returns {Array<BusinessUnit>} businessUnits - Flattened array of all loaded business units
 * @returns {number} total - Total number of business units available
 * @returns {() => void} fetchNextPage - Function to load the next page
 * @returns {boolean} hasNextPage - Whether more pages are available
 * @returns {boolean} isFetchingNextPage - Whether currently fetching next page
 * @returns {boolean} isLoading - Whether initial load is in progress
 * @returns {Error | null} error - Error if the query failed
 *
 * @example
 * ```tsx
 * import { useInfiniteBusinessUnits } from '@/hooks/useInfiniteBusinessUnits';
 * import { useInfiniteScroll } from '@/hooks/useInfinitePagination';
 *
 * function BusinessUnitList() {
 *   const {
 *     businessUnits,
 *     fetchNextPage,
 *     hasNextPage,
 *     isFetchingNextPage,
 *     isLoading,
 *   } = useInfiniteBusinessUnits(25);
 *
 *   const observerTarget = useInfiniteScroll(
 *     hasNextPage,
 *     isFetchingNextPage,
 *     fetchNextPage
 *   );
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return (
 *     <div>
 *       {businessUnits.map((unit) => (
 *         <BusinessUnitCard key={unit.id} unit={unit} />
 *       ))}
 *       <div ref={observerTarget} />
 *       {isFetchingNextPage && <Spinner />}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link BusinessUnit} for the business unit data structure
 * @see {@link useInfiniteScroll} for scroll-based pagination trigger
 */
export function useInfiniteBusinessUnits(pageSize: number = 25) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery(getBusinessUnitsInfiniteQuery(pageSize));

  // Flatten all pages into a single array
  const businessUnits: Array<BusinessUnit> = data?.pages.flatMap((page) => page.business_units) || [];
  const total = data?.pages[0]?.total || 0;

  return {
    businessUnits,
    total,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  };
}

