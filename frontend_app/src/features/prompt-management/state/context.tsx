import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { categoryQueryKeys } from "../data/queries";
import { promptManagementKeys } from "../data/keys";
import { buildTree } from "./tree-utils";
import { debugLogger } from "./debug";
import type { Category, Prompt, PromptManagementContextType, TreeNode } from "./types";
import type { ReactNode } from "react";
import type { PromptVisibility } from "@/features/prompt-management/data/api";
import {
  createCategory as apiCreateCategory,
  createSubcategory as apiCreateSubcategory,
  deleteCategory as apiDeleteCategory,
  deleteSubcategory as apiDeleteSubcategory,
  moveSubcategory as apiMoveSubcategory,
  updateCategory as apiUpdateCategory,
  updateSubcategory as apiUpdateSubcategory,
  fetchCategories,
  fetchSubcategories,
} from "@/features/prompt-management/data/api";

const PromptManagementContext = createContext<PromptManagementContextType | null>(null);

const STORAGE_KEY = "prompt-management-expanded";
const PROMPT_MANAGEMENT_CATEGORIES_KEY = promptManagementKeys.categories();
const PROMPT_MANAGEMENT_SUBCATEGORIES_KEY = promptManagementKeys.subcategories();

function loadExpandedIds(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.warn("Failed to load expanded state:", e);
  }
  return new Set();
}

function saveExpandedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch (e) {
    console.warn("Failed to save expanded state:", e);
  }
}

export function PromptManagementProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // State
  const [categories, setCategories] = useState<Array<Category>>([]);
  const [prompts, setPrompts] = useState<Array<Prompt>>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadExpandedIds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncQueryCaches = useCallback((nextCategories: Array<Category>, nextPrompts: Array<Prompt>) => {
    queryClient.setQueryData(PROMPT_MANAGEMENT_CATEGORIES_KEY, nextCategories);
    queryClient.setQueryData(PROMPT_MANAGEMENT_SUBCATEGORIES_KEY, nextPrompts);
    queryClient.setQueryData(categoryQueryKeys.categories(), nextCategories);
    queryClient.setQueryData(categoryQueryKeys.subcategories(), nextPrompts);
  }, [queryClient]);

  // Persist expanded state
  useEffect(() => {
    saveExpandedIds(expandedIds);
  }, [expandedIds]);

  // Keep category/subcategory query caches synchronized with local context state.
  useEffect(() => {
    syncQueryCaches(categories, prompts);
  }, [categories, prompts, syncQueryCaches]);

  // Keep selected references in sync when prompt/category objects are updated.
  useEffect(() => {
    setSelectedPrompt((current) => {
      if (!current) {
        return current;
      }
      return prompts.find((prompt) => prompt.id === current.id) ?? null;
    });
  }, [prompts]);

  useEffect(() => {
    setSelectedCategory((current) => {
      if (!current) {
        return current;
      }
      return categories.find((category) => category.id === current.id) ?? null;
    });
  }, [categories]);

  // Refresh data from API.
  const refreshData = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    debugLogger.info("Context", "refreshData started");
    try {
      const [categoriesData, promptsData] = await Promise.all([
        fetchCategories(),
        fetchSubcategories(),
      ]);
      debugLogger.debug("Context", "API data loaded", {
        categoriesCount: categoriesData.length,
        promptsCount: promptsData.length,
      });
      setCategories(categoriesData);
      setPrompts(promptsData);
    } catch (err: any) {
      debugLogger.error("Context", "refreshData failed", err);
      if (err?.status === 403) {
        window.location.href = "/unauthorised";
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load data";
      setError(message);
      console.error("Error fetching data:", err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      debugLogger.info("Context", "refreshData completed");
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshData(true);
  }, [refreshData]);

  // Actions
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const createCategory = useCallback(async (name: string, parentId: string | null) => {
    try {
      const createdCategory = await apiCreateCategory(name, parentId);
      setCategories((prev) => {
        if (prev.some((category) => category.id === createdCategory.id)) {
          return prev;
        }
        return [...prev, createdCategory];
      });
    } catch (err) {
      console.error("Error creating category:", err);
      throw err;
    }
  }, []);

  const createPrompt = useCallback(async (name: string, categoryId: string) => {
    try {
      const createdPrompt = await apiCreateSubcategory({
        name,
        categoryId,
        prompts: { default: "Enter your prompt content here..." },
        preSessionTalkingPoints: [],
        inSessionTalkingPoints: [],
      });
      setPrompts((prev) => {
        if (prev.some((prompt) => prompt.id === createdPrompt.id)) {
          return prev;
        }
        return [...prev, createdPrompt];
      });
    } catch (err) {
      console.error("Error creating prompt:", err);
      throw err;
    }
  }, []);

  const renameCategory = useCallback(async (id: string, name: string) => {
    try {
      const updatedCategory = await apiUpdateCategory({ categoryId: id, name });
      setCategories((prev) =>
        prev.map((category) =>
          category.id === id ? { ...category, ...updatedCategory } : category
        )
      );
    } catch (err) {
      console.error("Error renaming category:", err);
      throw err;
    }
  }, []);

  const deleteCategoryAction = useCallback(async (id: string) => {
    try {
      await apiDeleteCategory(id);
      if (selectedCategory?.id === id) {
        setSelectedCategory(null);
      }
      setCategories((prev) => prev.filter((category) => category.id !== id));
      setPrompts((prev) => prev.filter((prompt) => prompt.category_id !== id));
    } catch (err) {
      console.error("Error deleting category:", err);
      throw err;
    }
  }, [selectedCategory]);

  const deletePromptAction = useCallback(async (id: string) => {
    try {
      await apiDeleteSubcategory(id);
      if (selectedPrompt?.id === id) {
        setSelectedPrompt(null);
      }
      setPrompts((prev) => prev.filter((prompt) => prompt.id !== id));
    } catch (err) {
      console.error("Error deleting prompt:", err);
      throw err;
    }
  }, [selectedPrompt]);

  const movePrompt = useCallback(async (promptId: string, newCategoryId: string) => {
    try {
      const movedPrompt = await apiMoveSubcategory(promptId, newCategoryId);
      setPrompts((prev) =>
        prev.map((prompt) =>
          prompt.id === promptId ? { ...prompt, ...movedPrompt } : prompt
        )
      );
    } catch (err) {
      console.error("Error moving prompt:", err);
      throw err;
    }
  }, []);

  const editSubcategory = useCallback(async (
    subcategoryId: string,
    name: string,
    promptsData: Record<string, string>,
    preSessionTalkingPoints: Array<any> = [],
    inSessionTalkingPoints: Array<any> = [],
    analysis_model?: string,
    analysis_provider?: string,
    provider_parameters?: Record<string, any>,
    prompt_visibility?: PromptVisibility,
    visible_to_user_ids?: Array<string> | null,
    enhanced_reasoning_enabled?: boolean,
    prompt_constraints?: Record<string, any> | null,
  ) => {
    try {
      const updatedPrompt = await apiUpdateSubcategory({
        subcategoryId,
        name,
        prompts: promptsData,
        preSessionTalkingPoints,
        inSessionTalkingPoints,
        analysis_model,
        analysis_provider,
        provider_parameters,
        prompt_visibility,
        visible_to_user_ids,
        enhanced_reasoning_enabled,
        prompt_constraints,
      });
      setPrompts((prev) => {
        const existingIndex = prev.findIndex((prompt) => prompt.id === updatedPrompt.id);
        if (existingIndex === -1) {
          return [...prev, updatedPrompt];
        }
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...updatedPrompt };
        return next;
      });
      setSelectedPrompt((current) =>
        current?.id === updatedPrompt.id ? { ...current, ...updatedPrompt } : current
      );
    } catch (err) {
      console.error("Error updating subcategory:", err);
      throw err;
    }
  }, []);

  const tree = useMemo<Array<TreeNode>>(() => {
    debugLogger.debug("Context", "Building tree", {
      categoriesCount: categories.length,
      promptsCount: prompts.length,
    });
    const builtTree = buildTree(categories, prompts);
    debugLogger.debug("Context", "Tree built", {
      nodeCount: builtTree.length,
    });
    return builtTree;
  }, [categories, prompts]);

  const contextValue = useMemo(() => ({
    categories,
    prompts,
    selectedCategory,
    selectedPrompt,
    expandedIds,
    loading,
    error,
    tree,
    setSelectedCategory,
    setSelectedPrompt,
    toggleExpanded,
    createCategory,
    createPrompt,
    renameCategory,
    deleteCategory: deleteCategoryAction,
    deletePrompt: deletePromptAction,
    movePrompt,
    editSubcategory,
    refreshData,
  }), [
    categories,
    prompts,
    selectedCategory,
    selectedPrompt,
    expandedIds,
    loading,
    error,
    tree,
    toggleExpanded,
    createCategory,
    createPrompt,
    renameCategory,
    deleteCategoryAction,
    deletePromptAction,
    movePrompt,
    editSubcategory,
    refreshData,
  ]);

  return (
    <PromptManagementContext.Provider value={contextValue}>
      {children}
    </PromptManagementContext.Provider>
  );
}

export function usePromptManagement() {
  const context = useContext(PromptManagementContext);
  if (!context) {
    throw new Error("usePromptManagement must be used within PromptManagementProvider");
  }
  return context as PromptManagementContextType & { tree: Array<TreeNode> };
}

