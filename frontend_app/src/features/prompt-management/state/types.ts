import type { CategoryResponse, PromptVisibility, SubcategoryResponse } from "@/features/prompt-management/data/api";

export type Category = CategoryResponse;
export type Prompt = SubcategoryResponse;

export interface TreeFolder {
  type: 'folder';
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  category: Category;
  children: Array<TreeNode>;
}

export interface TreePrompt {
  type: 'prompt';
  id: string;
  name: string;
  depth: number;
  categoryId: string;
  prompt: Prompt;
}

export type TreeNode = TreeFolder | TreePrompt;

export interface PromptManagementState {
  categories: Array<Category>;
  prompts: Array<Prompt>;
  selectedCategory: Category | null;
  selectedPrompt: Prompt | null;
  expandedIds: Set<string>;
  loading: boolean;
  error: string | null;
}

export interface PromptManagementActions {
  setSelectedCategory: (category: Category | null) => void;
  setSelectedPrompt: (prompt: Prompt | null) => void;
  toggleExpanded: (id: string) => void;
  createCategory: (name: string, parentId: string | null) => Promise<void>;
  createPrompt: (name: string, categoryId: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  movePrompt: (promptId: string, newCategoryId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  editSubcategory: (
    subcategoryId: string,
    name: string,
    prompts: Record<string, string>,
    preSessionTalkingPoints?: Array<any>,
    inSessionTalkingPoints?: Array<any>,
    analysis_model?: string,
    analysis_provider?: string,
    provider_parameters?: Record<string, any>,
    prompt_visibility?: PromptVisibility,
    visible_to_user_ids?: Array<string> | null,
    enhanced_reasoning_enabled?: boolean,
    prompt_constraints?: Record<string, any> | null,
  ) => Promise<void>;
}

export type PromptManagementContextType = PromptManagementState & PromptManagementActions;

