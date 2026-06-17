import type {
  CategoryResponse,
  PaginatedCategoriesResponse,
  PaginatedSubcategoriesResponse,
  SubcategoryResponse,
} from "@/shared/data/taxonomy/types";
import { CATEGORIES_API, SUBCATEGORIES_API } from "@/shared/api/constants";
import { httpClient } from "@/shared/api/client/httpClient";

const MAX_PAGINATION_PAGES = 500;

function dedupeById<T extends { id: string }>(items: Array<T>): Array<T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export async function fetchCategoriesPaginated(
  limit: number = 25,
  offset: number = 0
): Promise<PaginatedCategoriesResponse> {
  const response = await httpClient.get<PaginatedCategoriesResponse>(CATEGORIES_API, {
    params: { limit, offset },
  });
  return response.data;
}

export async function fetchSubcategoriesPaginated(
  categoryId?: string,
  limit: number = 25,
  offset: number = 0,
  includeHidden: boolean = false
): Promise<PaginatedSubcategoriesResponse> {
  const params: Record<string, any> = { limit, offset };
  if (categoryId) {
    params.category_id = categoryId;
  }
  if (includeHidden) {
    params.include_hidden = true;
  }

  const response = await httpClient.get<PaginatedSubcategoriesResponse>(SUBCATEGORIES_API, {
    params,
  });
  return response.data;
}

export async function fetchCategories(): Promise<Array<CategoryResponse>> {
  const limit = 100;
  let offset = 0;
  const categories: Array<CategoryResponse> = [];

  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const pageData = await fetchCategoriesPaginated(limit, offset);
    categories.push(...pageData.categories);

    if (!pageData.has_more) {
      break;
    }

    const nextStep = pageData.categories.length > 0 ? pageData.categories.length : pageData.limit;
    if (nextStep <= 0) {
      break;
    }

    offset = pageData.offset + nextStep;
  }

  return dedupeById(categories);
}

export async function fetchSubcategories(categoryId?: string, includeHidden: boolean = false): Promise<Array<SubcategoryResponse>> {
  const limit = 100;
  let offset = 0;
  const subcategories: Array<SubcategoryResponse> = [];

  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const pageData = await fetchSubcategoriesPaginated(categoryId, limit, offset, includeHidden);
    subcategories.push(...pageData.subcategories);

    if (!pageData.has_more) {
      break;
    }

    const nextStep = pageData.subcategories.length > 0
      ? pageData.subcategories.length
      : pageData.limit;
    if (nextStep <= 0) {
      break;
    }

    offset = pageData.offset + nextStep;
  }

  return dedupeById(subcategories);
}
