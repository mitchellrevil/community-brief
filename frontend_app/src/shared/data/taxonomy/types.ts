export type PromptVisibility = "all" | "only_editors" | "nobody";

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
  prompts: Record<string, string>;
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
