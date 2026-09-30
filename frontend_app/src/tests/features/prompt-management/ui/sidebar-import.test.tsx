import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/features/prompt-management/ui/sidebar";

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  readPromptFile: vi.fn(),
  refreshData: vi.fn(),
  setSelectedPrompt: vi.fn(),
  toggleExpanded: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  permission: "Editor",
}));

const selectedCategory = {
  id: "category-1",
  name: "Research",
  business_unit_id: "business-unit-1",
};

vi.mock("@/shared/data/templates", () => ({
  createTemplate: mocks.createTemplate,
}));

vi.mock("@/features/prompt-management/lib/prompt-file", () => ({
  readPromptFile: mocks.readPromptFile,
}));

vi.mock("@/features/prompt-management/state/context", () => ({
  usePromptManagement: () => ({
    tree: [],
    loading: false,
    error: null,
    selectedCategory,
    selectedPrompt: null,
    expandedIds: new Set<string>(),
    setSelectedCategory: vi.fn(),
    setSelectedPrompt: mocks.setSelectedPrompt,
    toggleExpanded: mocks.toggleExpanded,
    createCategory: vi.fn(),
    createPrompt: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    deletePrompt: vi.fn(),
    movePrompt: vi.fn(),
    editSubcategory: vi.fn(),
    refreshData: mocks.refreshData,
  }),
}));

vi.mock("@/hooks/usePermissions", () => ({
  useUserPermissions: () => ({
    data: {
      permission: mocks.permission,
      business_unit_ids: ["business-unit-1"],
    },
  }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

describe("Sidebar prompt import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission = "Editor";
  });

  it("shows Models beside the category action only for admins", () => {
    mocks.permission = "Admin";

    render(<Sidebar />);

    const modelsButton = screen.getByRole("button", { name: "Models" });
    const categoryButton = screen.getByTitle("New folder");
    expect(modelsButton.parentElement).toBe(categoryButton.parentElement);
  });

  it("hides Models from non-admin users", () => {
    render(<Sidebar />);

    expect(
      screen.queryByRole("button", { name: "Models" }),
    ).not.toBeInTheDocument();
  });

  it("creates the imported template in the selected folder", async () => {
    const template = {
      name: "Imported prompt",
      prompts: { default: "Imported content" },
      visibility: "only_editors" as const,
    };
    const created = {
      id: "prompt-1",
      folder_id: selectedCategory.id,
      name: template.name,
      prompts: template.prompts,
      created_at: 1,
      updated_at: 1,
    };
    mocks.readPromptFile.mockResolvedValue({
      template,
      userAllowlistOmitted: true,
    });
    mocks.createTemplate.mockResolvedValue(created);

    const { container } = render(<Sidebar />);
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["{}"], "import.prompt", {
      type: "application/json",
    });

    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.createTemplate).toHaveBeenCalledWith({
        ...template,
        folder_id: selectedCategory.id,
      });
    });
    expect(mocks.readPromptFile).toHaveBeenCalledWith(file);
    expect(mocks.refreshData).toHaveBeenCalledOnce();
    expect(mocks.setSelectedPrompt).toHaveBeenCalledWith(created);
    expect(mocks.toggleExpanded).toHaveBeenCalledWith(selectedCategory.id);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Template imported as Editors Only. Reconfigure user access before publishing.",
    );
    expect(input?.value).toBe("");
  });

  it("leaves prompt state unchanged when the file is invalid", async () => {
    mocks.readPromptFile.mockRejectedValue(new Error("Invalid .prompt file"));

    const { container } = render(<Sidebar />);
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(input!, {
      target: { files: [new File(["bad"], "bad.prompt")] },
    });

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Invalid .prompt file");
    });
    expect(mocks.createTemplate).not.toHaveBeenCalled();
    expect(mocks.refreshData).not.toHaveBeenCalled();
    expect(mocks.setSelectedPrompt).not.toHaveBeenCalled();
  });
});
