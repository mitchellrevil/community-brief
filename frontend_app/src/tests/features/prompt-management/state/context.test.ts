import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import {
  PromptManagementProvider,
  usePromptManagement,
} from "@/features/prompt-management/state/context";

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  createFolder: vi.fn(),
  deleteTemplate: vi.fn(),
  deleteFolder: vi.fn(),
  patchTemplate: vi.fn(),
  patchFolder: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/shared/data/templates", () => ({
  createTemplate: mocks.createTemplate,
  createFolder: mocks.createFolder,
  deleteTemplate: mocks.deleteTemplate,
  deleteFolder: mocks.deleteFolder,
  patchTemplate: mocks.patchTemplate,
  patchFolder: mocks.patchFolder,
  templatesKeys: { root: ["community-brief", "templates"] },
  useTemplates: () => ({
    folders: [
      {
        id: "folder-1",
        name: "Folder One",
        created_at: 1,
        updated_at: 1,
        parent_id: null,
        is_business_unit: false,
      },
      {
        id: "folder-2",
        name: "Folder Two",
        created_at: 1,
        updated_at: 1,
        parent_id: null,
        is_business_unit: false,
      },
      {
        id: "folder-3",
        name: "Nested Folder",
        created_at: 1,
        updated_at: 1,
        parent_id: "folder-1",
        is_business_unit: false,
      },
    ],
    templates: [
      {
        id: "template-1",
        name: "Meeting One",
        folder_id: "folder-1",
        prompts: {},
        pre_session_talking_points: [],
        in_session_talking_points: [],
        analysis_workflow: "standard",
        visibility: "all",
        speaker_identification_enabled: false,
        recording_disclaimer_enabled: false,
        created_at: 1,
        updated_at: 1,
      },
      {
        id: "template-2",
        name: "Nested Meeting",
        folder_id: "folder-3",
        prompts: {},
        pre_session_talking_points: [],
        in_session_talking_points: [],
        analysis_workflow: "standard",
        visibility: "all",
        speaker_identification_enabled: false,
        recording_disclaimer_enabled: false,
        created_at: 1,
        updated_at: 1,
      },
    ],
    isLoading: false,
    foldersError: null,
    templatesError: null,
    refresh: mocks.refresh,
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(PromptManagementProvider, null, children),
    );
  };
}

describe("PromptManagementProvider catalog mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("selects a newly created template and invalidates the shared catalog", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    mocks.createTemplate.mockResolvedValue({
      id: "template-2",
      folder_id: "folder-1",
    });
    const { result } = renderHook(() => usePromptManagement(), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.createPrompt("New Meeting", "folder-1"));

    expect(result.current.selectedCategory?.id).toBe("folder-1");
    expect(mocks.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Meeting", folder_id: "folder-1" }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["community-brief", "templates"],
    });
  });

  it("moves through PATCH, updates folder selection, and invalidates once", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    mocks.patchTemplate.mockResolvedValue({});
    const { result } = renderHook(() => usePromptManagement(), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.movePrompt("template-1", "folder-2"));

    expect(mocks.patchTemplate).toHaveBeenCalledWith("template-1", {
      folder_id: "folder-2",
    });
    expect(result.current.selectedCategory?.id).toBe("folder-2");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("clears descendant selection and expansion after deleting a parent folder", async () => {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    mocks.deleteFolder.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePromptManagement(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.setSelectedCategory(
        result.current.categories.find((item) => item.id === "folder-3")!,
      );
      result.current.setSelectedPrompt(
        result.current.prompts.find((item) => item.id === "template-2")!,
      );
      result.current.toggleExpanded("folder-1");
      result.current.toggleExpanded("folder-3");
    });

    await act(() => result.current.deleteCategory("folder-1"));

    expect(mocks.deleteFolder).toHaveBeenCalledWith("folder-1");
    expect(result.current.selectedCategory).toBeNull();
    expect(result.current.selectedPrompt).toBeNull();
    expect(result.current.expandedIds.has("folder-1")).toBe(false);
    expect(result.current.expandedIds.has("folder-3")).toBe(false);
  });
});
