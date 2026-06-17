import { useInfiniteQuery } from "@tanstack/react-query";
import type { CategoryResponse } from "@/features/prompt-management/data/api";
import { getPromptManagementCategoriesInfiniteQuery } from "@/features/prompt-management/data/queries";

/**
 * Hook for infinite scrolling through categories in the sidebar.
 *
 * Provides paginated access to prompt categories for the sidebar navigation.
 * Optimized for sidebar display with configurable page size.
 *
 * @description Uses TanStack Query's useInfiniteQuery for efficient data
 * loading. Flattens all pages into a single array for rendering.
 *
 * @param {number} [pageSize=30] - Number of categories per page
 *
 * @returns Infinite query result for categories
 * @returns {Array<CategoryResponse>} categories - Flattened array of all loaded categories
 * @returns {() => void} fetchNextPage - Function to load the next page
 * @returns {boolean} hasNextPage - Whether more pages are available
 * @returns {boolean} isFetchingNextPage - Whether currently fetching next page
 * @returns {boolean} isLoading - Whether initial load is in progress
 * @returns {Error | null} error - Error if the query failed
 *
 * @example
 * ```tsx
 * import { useInfiniteCategoriesSidebar } from '@/hooks/useInfiniteCategoriesSidebar';
 *
 * function CategorySidebar() {
 *   const {
 *     categories,
 *     fetchNextPage,
 *     hasNextPage,
 *     isFetchingNextPage,
 *     isLoading,
 *   } = useInfiniteCategoriesSidebar();
 *
 *   return (
 *     <aside>
 *       {isLoading ? (
 *         <CategorySkeleton />
 *       ) : (
 *         categories.map((cat) => (
 *           <CategoryItem key={cat.id} category={cat} />
 *         ))
 *       )}
 *       {hasNextPage && (
 *         <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
 *           Load More
 *         </Button>
 *       )}
 *     </aside>
 *   );
 * }
 * ```
 *
 * @see {@link CategoryResponse} for the category data structure
 * @see {@link useCategoryData} for non-paginated category access with helpers
 */
export function useInfiniteCategoriesSidebar(pageSize: number = 30) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery(getPromptManagementCategoriesInfiniteQuery(pageSize));

  // Flatten all pages into a single array
  const categories: Array<CategoryResponse> = data?.pages.flatMap((page) => page.categories) || [];

  return {
    categories,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  };
}
