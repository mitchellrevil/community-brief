import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CategoryResponse, SubcategoryResponse } from "@/shared/data/taxonomy/types";
import { fetchCategories, fetchSubcategories } from "@/shared/data/taxonomy/api";
import { CATEGORY_STALE_TIME, taxonomyQueryKeys } from "@/shared/data/taxonomy/keys";

export { CATEGORY_STALE_TIME };

/**
 * Query key factory for category-related queries.
 * Uses consistent keys across all components to ensure cache sharing.
 */
export const categoryQueryKeys = taxonomyQueryKeys;

/**
 * Results from the useCategoryData hook.
 */
export interface UseCategoryDataResult {
  // Categories data
  categories: Array<CategoryResponse>;
  isLoadingCategories: boolean;
  categoriesError: Error | null;
  
  // Subcategories data
  subcategories: Array<SubcategoryResponse>;
  isLoadingSubcategories: boolean;
  subcategoriesError: Error | null;
  
  // Combined loading state
  isLoading: boolean;
  
  // Helper functions
  getSubcategoriesForCategory: (categoryId: string) => Array<SubcategoryResponse>;
  getSubcategoryById: (subcategoryId: string) => SubcategoryResponse | undefined;
  getCategoryById: (categoryId: string) => CategoryResponse | undefined;
  
  // Refetch functions
  refetchCategories: () => Promise<void>;
  refetchSubcategories: () => Promise<void>;
}

/**
 * Centralized hook for fetching and caching category and subcategory data.
 * 
 * This hook consolidates category/subcategory fetching into a single shared source,
 * eliminating redundant API calls when multiple components need this data.
 * 
 * Features:
 * - Shared cache across all components using consistent query keys
 * - Configurable staleTime to prevent unnecessary refetches
 * - Helper functions for common data access patterns
 * - Proper error handling and loading states
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { 
 *     categories, 
 *     subcategories, 
 *     isLoading,
 *     getSubcategoriesForCategory 
 *   } = useCategoryData();
 *   
 *   if (isLoading) return <Spinner />;
 *   
 *   return (
 *     <div>
 *       {categories.map(cat => (
 *         <div key={cat.id}>
 *           {cat.name}
 *           {getSubcategoriesForCategory(cat.id).map(sub => (
 *             <span key={sub.id}>{sub.name}</span>
 *           ))}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCategoryData(): UseCategoryDataResult {
  // Fetch categories
  const {
    data: categoriesData,
    isLoading: isLoadingCategories,
    error: categoriesError,
    refetch: refetchCategoriesQuery,
  } = useQuery({
    queryKey: categoryQueryKeys.categories(),
    queryFn: () => fetchCategories(),
    staleTime: CATEGORY_STALE_TIME,
  });

  // Fetch subcategories
  const {
    data: subcategoriesData,
    isLoading: isLoadingSubcategories,
    error: subcategoriesError,
    refetch: refetchSubcategoriesQuery,
  } = useQuery({
    queryKey: categoryQueryKeys.subcategories(),
    queryFn: () => fetchSubcategories(),
    staleTime: CATEGORY_STALE_TIME,
  });

  // Memoized categories array (fallback to empty array)
  const categories = useMemo(
    () => categoriesData ?? [],
    [categoriesData]
  );

  // Memoized subcategories array (fallback to empty array)
  const subcategories = useMemo(
    () => subcategoriesData ?? [],
    [subcategoriesData]
  );

  // Helper: Get subcategories for a specific category
  const getSubcategoriesForCategory = useCallback(
    (categoryId: string): Array<SubcategoryResponse> => {
      return subcategories.filter((sub) => sub.category_id === categoryId);
    },
    [subcategories]
  );

  // Helper: Get a specific subcategory by ID
  const getSubcategoryById = useCallback(
    (subcategoryId: string): SubcategoryResponse | undefined => {
      return subcategories.find((sub) => sub.id === subcategoryId);
    },
    [subcategories]
  );

  // Helper: Get a specific category by ID
  const getCategoryById = useCallback(
    (categoryId: string): CategoryResponse | undefined => {
      return categories.find((cat) => cat.id === categoryId);
    },
    [categories]
  );

  // Refetch wrappers
  const refetchCategories = useCallback(async () => {
    await refetchCategoriesQuery();
  }, [refetchCategoriesQuery]);

  const refetchSubcategories = useCallback(async () => {
    await refetchSubcategoriesQuery();
  }, [refetchSubcategoriesQuery]);

  return {
    // Categories
    categories,
    isLoadingCategories,
    categoriesError: categoriesError,

    // Subcategories
    subcategories,
    isLoadingSubcategories,
    subcategoriesError: subcategoriesError,

    // Combined loading
    isLoading: isLoadingCategories || isLoadingSubcategories,

    // Helpers
    getSubcategoriesForCategory,
    getSubcategoryById,
    getCategoryById,

    // Refetch
    refetchCategories,
    refetchSubcategories,
  };
}

