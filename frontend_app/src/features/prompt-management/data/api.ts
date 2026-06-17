import {
  CATEGORIES_API,
  PROMPTS_API,
  SUBCATEGORIES_API,
  SUBCATEGORY_VERSIONS_API,
  SUBCATEGORY_VERSION_DIFF_API,
  SUBCATEGORY_VERSION_ROLLBACK_API,
} from "@/shared/api/constants";
import { httpClient } from "@/shared/api/client/httpClient";

export type PromptVisibility = "all" | "only_editors" | "nobody";

interface Prompt {
  [key: string]: string;
}

interface Subcategory {
  subcategory_name: string;
  subcategory_id: string;
  prompts: Prompt;
  preSessionTalkingPoints?: Array<any>;
  inSessionTalkingPoints?: Array<any>;
  analysis_model?: string;
  analysis_reasoning?: string;
  analysis_verbosity?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, any>;
  prompt_visibility?: PromptVisibility;
  visible_to_user_ids?: Array<string> | null;
}

interface Category {
  category_name: string;
  category_id: string;
  subcategories: Array<Subcategory>;
}

interface PromptsResponse {
  status: number;
  data: Array<Category>;
}

export interface CategoryResponse {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  parent_category_id?: string | null;
  business_unit_id?: string | null;
  is_business_unit?: boolean;
}

export interface SubcategoryResponse {
  id: string;
  name: string;
  category_id: string;
  prompts: Prompt;
  preSessionTalkingPoints?: Array<any>;
  inSessionTalkingPoints?: Array<any>;
  created_at: number;
  updated_at: number;
  updated_by_user_id?: string;
  updated_by_display_name?: string;
  business_unit_id?: string | null;
  analysis_model?: string;
  analysis_reasoning?: string;
  analysis_verbosity?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, any>;
  prompt_visibility?: PromptVisibility;
  visible_to_user_ids?: Array<string> | null;
}

export interface PaginatedCategoriesResponse {
  categories: Array<CategoryResponse>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface PaginatedSubcategoriesResponse {
  subcategories: Array<SubcategoryResponse>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface PromptVersionMetadataResponse {
  id: string;
  created_at?: number;
  created_by_user_id?: string;
  created_by_display_name?: string;
  source_action?: string;
  change_reason?: string;
}

export interface PromptVersionListResponse {
  versions: Array<PromptVersionMetadataResponse>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface PromptVersionDiffResponse {
  left: PromptVersionMetadataResponse;
  right: PromptVersionMetadataResponse;
  left_text: string;
  right_text: string;
  summary: {
    added: number;
    removed: number;
  };
}

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
  offset: number = 0
): Promise<PaginatedSubcategoriesResponse> {
  const params: Record<string, any> = { limit, offset, include_hidden: true };
  if (categoryId) {
    params.category_id = categoryId;
  }
  const response = await httpClient.get<PaginatedSubcategoriesResponse>(SUBCATEGORIES_API, {
    params,
  });
  return response.data;
}

export async function fetchPrompts(): Promise<PromptsResponse> {
  const response = await httpClient.get(PROMPTS_API);

  return response.data;
}

export async function createCategory(name: string, parent_category_id?: string | null): Promise<CategoryResponse> {
  const payload: any = { name };
  if (typeof parent_category_id !== "undefined") payload.parent_category_id = parent_category_id;
  const response = await httpClient.post(CATEGORIES_API, payload);
  return response.data;
}

export async function fetchCategories(): Promise<Array<CategoryResponse>> {
  const limit = 100;
  let offset = 0;
  const categories: Array<CategoryResponse> = [];

  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const response = await httpClient.get<PaginatedCategoriesResponse>(CATEGORIES_API, {
      params: { limit, offset },
    });

    const pageData = response.data;
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

export interface UpdateCategoryArgs {
  categoryId: string | undefined;
  name: string;
  parent_category_id?: string | null;
}

export async function updateCategory({
  categoryId,
  name,
  parent_category_id,
}: UpdateCategoryArgs): Promise<CategoryResponse> {
  if (!categoryId) {
    console.error("Category ID is undefined or empty");
    throw new Error("Invalid category ID. Cannot update category.");
  }

  const payload: any = { name };
  if (typeof parent_category_id !== "undefined") payload.parent_category_id = parent_category_id;
  const response = await httpClient.put(`${CATEGORIES_API}/${encodeURIComponent(categoryId)}`, payload);

  return response.data;
}

export async function deleteCategory(
  categoryId: string,
): Promise<CategoryResponse> {
  const response = await httpClient.delete(`${CATEGORIES_API}/${encodeURIComponent(categoryId)}`);

  return response.data;
}

export type CreateSubcategoryArgs = {
  name: string;
  categoryId: string;
  prompts: Record<string, string>;
  preSessionTalkingPoints?: Array<any>;
  inSessionTalkingPoints?: Array<any>;
  analysis_model?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, any>;
  prompt_visibility?: PromptVisibility;
  visible_to_user_ids?: Array<string> | null;
};

export async function createSubcategory({
  name,
  categoryId,
  prompts,
  preSessionTalkingPoints = [],
  inSessionTalkingPoints = [],
  analysis_model,
  analysis_provider,
  provider_parameters,
  prompt_visibility,
  visible_to_user_ids,
}: CreateSubcategoryArgs): Promise<SubcategoryResponse> {
  const payload: any = {
    name,
    category_id: categoryId,
    prompts,
    preSessionTalkingPoints,
    inSessionTalkingPoints,
  };

  if (analysis_model) payload.analysis_model = analysis_model;
  if (analysis_provider) payload.analysis_provider = analysis_provider;
  if (provider_parameters) payload.provider_parameters = provider_parameters;
  if (prompt_visibility !== undefined) payload.prompt_visibility = prompt_visibility;
  if (visible_to_user_ids !== undefined) payload.visible_to_user_ids = visible_to_user_ids;

  const response = await httpClient.post(SUBCATEGORIES_API, payload);

  return response.data;
}

export async function fetchSubcategories(
  categoryId?: string,
): Promise<Array<SubcategoryResponse>> {
  const limit = 100;
  let offset = 0;
  const subcategories: Array<SubcategoryResponse> = [];

  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const params: Record<string, any> = { limit, offset, include_hidden: true };
    if (categoryId) {
      params.category_id = categoryId;
    }

    const response = await httpClient.get<PaginatedSubcategoriesResponse>(SUBCATEGORIES_API, {
      params,
    });

    const pageData = response.data;
    subcategories.push(...pageData.subcategories);

    if (!pageData.has_more) {
      break;
    }

    const nextStep = pageData.subcategories.length > 0 ? pageData.subcategories.length : pageData.limit;
    if (nextStep <= 0) {
      break;
    }

    offset = pageData.offset + nextStep;
  }

  return dedupeById(subcategories);
}

export interface UpdateSubcategoryArgs {
  subcategoryId: string | undefined;
  name: string;
  prompts: Record<string, string>;
  preSessionTalkingPoints?: Array<any>;
  inSessionTalkingPoints?: Array<any>;
  analysis_model?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, any>;
  prompt_visibility?: PromptVisibility;
  visible_to_user_ids?: Array<string> | null;
  enhanced_reasoning_enabled?: boolean;
  prompt_constraints?: Record<string, any> | null;
}

export async function updateSubcategory({
  subcategoryId,
  name,
  prompts,
  preSessionTalkingPoints = [],
  inSessionTalkingPoints = [],
  analysis_model,
  analysis_provider,
  provider_parameters,
  prompt_visibility,
  visible_to_user_ids,
  enhanced_reasoning_enabled,
  prompt_constraints,
}: UpdateSubcategoryArgs): Promise<SubcategoryResponse> {
  if (!subcategoryId) {
    console.error("Subcategory ID is undefined or empty");
    throw new Error("Invalid subcategory ID. Cannot update subcategory.");
  }

  const payload: any = {
    name,
    prompts,
    preSessionTalkingPoints,
    inSessionTalkingPoints,
  };

  if (analysis_model !== undefined) payload.analysis_model = analysis_model;
  if (analysis_provider !== undefined) payload.analysis_provider = analysis_provider;
  if (provider_parameters !== undefined) payload.provider_parameters = provider_parameters;
  if (prompt_visibility !== undefined) payload.prompt_visibility = prompt_visibility;
  if (visible_to_user_ids !== undefined) payload.visible_to_user_ids = visible_to_user_ids;
  if (enhanced_reasoning_enabled !== undefined) payload.enhanced_reasoning_enabled = enhanced_reasoning_enabled;
  if (prompt_constraints !== undefined) payload.prompt_constraints = prompt_constraints;

  const response = await httpClient.put(
    `${SUBCATEGORIES_API}/${encodeURIComponent(subcategoryId)}`,
    payload,
  );

  return response.data;
}

export async function deleteSubcategory(
  subcategoryId: string,
): Promise<SubcategoryResponse> {
  if (!subcategoryId || typeof subcategoryId !== "string") {
    console.error("Invalid subcategory ID:", subcategoryId);
    throw new Error("Invalid subcategory ID. Cannot delete subcategory.");
  }

  const response = await httpClient.delete(
    `${SUBCATEGORIES_API}/${encodeURIComponent(subcategoryId)}`,
  );

  return response.data;
}

export async function moveSubcategory(
  subcategoryId: string,
  newCategoryId: string,
): Promise<SubcategoryResponse> {
  if (!subcategoryId || typeof subcategoryId !== "string") {
    console.error("Invalid subcategory ID:", subcategoryId);
    throw new Error("Invalid subcategory ID. Cannot move subcategory.");
  }

  if (!newCategoryId || typeof newCategoryId !== "string") {
    console.error("Invalid category ID:", newCategoryId);
    throw new Error("Invalid category ID. Cannot move subcategory.");
  }

  const response = await httpClient.patch(
    `${SUBCATEGORIES_API}/${encodeURIComponent(subcategoryId)}/move`,
    null,
    {
      params: {
        new_category_id: newCategoryId,
      },
    },
  );

  return response.data;
}

export async function fetchSubcategoryVersions(
  subcategoryId: string,
  limit: number = 25,
  offset: number = 0,
): Promise<PromptVersionListResponse> {
  if (!subcategoryId || typeof subcategoryId !== "string") {
    console.error("Invalid subcategory ID:", subcategoryId);
    throw new Error("Invalid subcategory ID. Cannot fetch versions.");
  }

  const encodedId = encodeURIComponent(subcategoryId);
  const response = await httpClient.get<PromptVersionListResponse>(
    SUBCATEGORY_VERSIONS_API(encodedId),
    { params: { limit, offset } },
  );

  return response.data;
}

export async function fetchSubcategoryVersionDiff(
  subcategoryId: string,
  left: string,
  right: string,
): Promise<PromptVersionDiffResponse> {
  if (!subcategoryId || typeof subcategoryId !== "string") {
    console.error("Invalid subcategory ID:", subcategoryId);
    throw new Error("Invalid subcategory ID. Cannot fetch version diff.");
  }

  const encodedId = encodeURIComponent(subcategoryId);
  const response = await httpClient.get<PromptVersionDiffResponse>(
    SUBCATEGORY_VERSION_DIFF_API(encodedId),
    {
      params: { left, right },
    },
  );

  return response.data;
}

export async function rollbackSubcategoryVersion(
  subcategoryId: string,
  versionId: string,
  reason?: string,
): Promise<SubcategoryResponse> {
  if (!subcategoryId || typeof subcategoryId !== "string") {
    console.error("Invalid subcategory ID:", subcategoryId);
    throw new Error("Invalid subcategory ID. Cannot rollback version.");
  }

  if (!versionId || typeof versionId !== "string") {
    console.error("Invalid version ID:", versionId);
    throw new Error("Invalid version ID. Cannot rollback version.");
  }

  const encodedSubcategoryId = encodeURIComponent(subcategoryId);
  const encodedVersionId = encodeURIComponent(versionId);

  const response = await httpClient.post<SubcategoryResponse>(
    SUBCATEGORY_VERSION_ROLLBACK_API(encodedSubcategoryId, encodedVersionId),
    { reason },
  );

  return response.data;
}




