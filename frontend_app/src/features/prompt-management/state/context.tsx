import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildTree } from "./tree-utils";
import type {
  PromptMetadata,
  PromptVisibility,
  TemplateView,
} from "@/shared/data/templates";
import type { ReactNode } from "react";
import type {
  Category,
  Prompt,
  PromptManagementContextType,
  TreeNode,
} from "./types";
import {
  createFolder,
  createTemplate,
  deleteFolder,
  deleteTemplate,
  patchFolder,
  patchTemplate,
  templatesKeys,
  useTemplates,
} from "@/shared/data/templates";


const PromptManagementContext =
  createContext<PromptManagementContextType | null>(null);
const STORAGE_KEY = "prompt-management-expanded";

function loadExpandedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function PromptManagementProvider({
  children,
  view = "management",
}: {
  children: ReactNode;
  view?: TemplateView;
}) {
  const queryClient = useQueryClient();
  const catalog = useTemplates(view);
  const categories = catalog.folders;
  const prompts = catalog.templates;
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadExpandedIds);

  const selectedCategory = useMemo(
    () => categories.find((folder) => folder.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const selectedPrompt = useMemo(
    () => prompts.find((template) => template.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );
  const error = catalog.foldersError ?? catalog.templatesError;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedIds]));
  }, [expandedIds]);

  const invalidateCatalog = useCallback(
    () => queryClient.invalidateQueries({ queryKey: templatesKeys.root }),
    [queryClient],
  );
  const refreshData = useCallback(() => catalog.refresh(), [catalog.refresh]);

  const setSelectedCategory = useCallback((folder: Category | null) => {
    setSelectedCategoryId(folder?.id ?? null);
  }, []);
  const setSelectedPrompt = useCallback((template: Prompt | null) => {
    setSelectedPromptId(template?.id ?? null);
  }, []);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const createCategory = useCallback(
    async (name: string, parentId: string | null) => {
      const created = await createFolder({ name, parent_id: parentId });
      await invalidateCatalog();
      setSelectedCategoryId(created.id);
    },
    [invalidateCatalog],
  );

  const createPrompt = useCallback(
    async (name: string, categoryId: string) => {
      const created = await createTemplate({
        folder_id: categoryId,
        name,
        prompts: { default: "Enter your prompt content here..." },
        pre_session_talking_points: [],
        in_session_talking_points: [],
        analysis_workflow: "standard",
        visibility: "all",
        speaker_identification_enabled: false,
        recording_disclaimer_enabled: false,
      });
      await invalidateCatalog();
      setSelectedCategoryId(categoryId);
      setSelectedPromptId(created.id);
    },
    [invalidateCatalog],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      await patchFolder(id, { name });
      await invalidateCatalog();
    },
    [invalidateCatalog],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const deletedFolderIds = new Set([id]);
      let foundChild = true;
      while (foundChild) {
        foundChild = false;
        for (const category of categories) {
          if (
            category.parent_id &&
            deletedFolderIds.has(category.parent_id) &&
            !deletedFolderIds.has(category.id)
          ) {
            deletedFolderIds.add(category.id);
            foundChild = true;
          }
        }
      }
      await deleteFolder(id);
      if (selectedCategoryId && deletedFolderIds.has(selectedCategoryId)) {
        setSelectedCategoryId(null);
      }
      if (
        prompts.some(
          (template) =>
            deletedFolderIds.has(template.folder_id) &&
            template.id === selectedPromptId,
        )
      ) {
        setSelectedPromptId(null);
      }
      setExpandedIds((previous) => {
        const next = new Set(previous);
        deletedFolderIds.forEach((folderId) => next.delete(folderId));
        return next;
      });
      await invalidateCatalog();
    },
    [
      categories,
      invalidateCatalog,
      prompts,
      selectedCategoryId,
      selectedPromptId,
    ],
  );

  const deletePrompt = useCallback(
    async (id: string) => {
      await deleteTemplate(id);
      if (selectedPromptId === id) setSelectedPromptId(null);
      await invalidateCatalog();
    },
    [invalidateCatalog, selectedPromptId],
  );

  const movePrompt = useCallback(
    async (promptId: string, newCategoryId: string) => {
      await patchTemplate(promptId, { folder_id: newCategoryId });
      setSelectedCategoryId(newCategoryId);
      await invalidateCatalog();
    },
    [invalidateCatalog],
  );

  const editSubcategory = useCallback(
    async (
      subcategoryId: string,
      name: string,
      promptMap: Record<string, string>,
      preSessionTalkingPoints: Array<any> = [],
      inSessionTalkingPoints: Array<any> = [],
      analysis_model?: string,
      analysis_provider?: string,
      provider_parameters?: Record<string, any>,
      analysis_workflow?: "standard" | "structured_review",
      prompt_visibility?: PromptVisibility,
      visible_to_user_ids?: Array<string> | null,
      speaker_identification_enabled?: boolean,
      prompt_metadata?: PromptMetadata | null,
      recording_disclaimer_enabled?: boolean,
      recording_disclaimer?: string | null,
    ) => {
      await patchTemplate(subcategoryId, {
        name,
        prompts: promptMap,
        pre_session_talking_points: preSessionTalkingPoints,
        in_session_talking_points: inSessionTalkingPoints,
        analysis_model,
        analysis_provider,
        provider_parameters,
        analysis_workflow,
        visibility: prompt_visibility,
        visible_to_user_ids,
        speaker_identification_enabled,
        prompt_metadata,
        recording_disclaimer_enabled,
        recording_disclaimer,
      });
      await invalidateCatalog();
    },
    [invalidateCatalog],
  );

  const tree = useMemo<Array<TreeNode>>(
    () => buildTree(categories, prompts),
    [categories, prompts],
  );
  const contextValue = useMemo<
    PromptManagementContextType & { tree: Array<TreeNode> }
  >(
    () => ({
      categories,
      prompts,
      selectedCategory,
      selectedPrompt,
      expandedIds,
      loading: catalog.isLoading,
      error: error?.message ?? null,
      tree,
      setSelectedCategory,
      setSelectedPrompt,
      toggleExpanded,
      createCategory,
      createPrompt,
      renameCategory,
      deleteCategory,
      deletePrompt,
      movePrompt,
      editSubcategory,
      refreshData,
    }),
    [
      categories,
      prompts,
      selectedCategory,
      selectedPrompt,
      expandedIds,
      catalog.isLoading,
      refreshData,
      error,
      tree,
      setSelectedCategory,
      setSelectedPrompt,
      toggleExpanded,
      createCategory,
      createPrompt,
      renameCategory,
      deleteCategory,
      deletePrompt,
      movePrompt,
      editSubcategory,
    ],
  );

  return (
    <PromptManagementContext.Provider value={contextValue}>
      {children}
    </PromptManagementContext.Provider>
  );
}

export function usePromptManagement() {
  const context = useContext(PromptManagementContext);
  if (!context) {
    throw new Error(
      "usePromptManagement must be used within PromptManagementProvider",
    );
  }
  return context as PromptManagementContextType & { tree: Array<TreeNode> };
}
