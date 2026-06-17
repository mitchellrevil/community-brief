import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { promptManagementKeys } from "./keys";
import {
  fetchCategories,
  fetchCategoriesPaginated,
  fetchSubcategories,
  fetchSubcategoriesPaginated,
} from "@/features/prompt-management/data/api";

export {
  CATEGORY_STALE_TIME,
  categoryQueryKeys,
  useCategoryData,
  type UseCategoryDataResult,
} from "@/hooks/useCategoryData";

function getNextOffset(
  hasMore: boolean,
  offset: number,
  limit: number,
  itemCount: number,
): number | undefined {
  if (!hasMore) {
    return undefined;
  }

  const step = itemCount > 0 ? itemCount : limit;
  return step > 0 ? offset + step : undefined;
}

export function getPromptManagementCategoriesQuery() {
  return queryOptions({
    queryKey: promptManagementKeys.categories(),
    queryFn: () => fetchCategories(),
  });
}

export function getPromptManagementSubcategoriesQuery() {
  return queryOptions({
    queryKey: promptManagementKeys.subcategories(),
    queryFn: () => fetchSubcategories(),
  });
}

export function getPromptManagementCategoriesInfiniteQuery(pageSize: number = 50) {
  return infiniteQueryOptions({
    queryKey: promptManagementKeys.categoriesInfinite(pageSize),
    queryFn: ({ pageParam = 0 }) => fetchCategoriesPaginated(pageSize, pageParam),
    getNextPageParam: (lastPage) =>
      getNextOffset(lastPage.has_more, lastPage.offset, lastPage.limit, lastPage.categories.length),
    initialPageParam: 0,
  });
}

export function getPromptManagementSubcategoriesInfiniteQuery(
  categoryId?: string,
  pageSize: number = 50,
) {
  return infiniteQueryOptions({
    queryKey: promptManagementKeys.subcategoriesInfinite(categoryId, pageSize),
    queryFn: ({ pageParam = 0 }) =>
      fetchSubcategoriesPaginated(categoryId, pageSize, pageParam),
    getNextPageParam: (lastPage) =>
      getNextOffset(
        lastPage.has_more,
        lastPage.offset,
        lastPage.limit,
        lastPage.subcategories.length,
      ),
    initialPageParam: 0,
  });
}

