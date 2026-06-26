import { ReprocessAnalysisDialog } from "@/features/recordings/ui/ReprocessAnalysisDialog";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const categories = [
    { id: "cat-b", name: "Children Services", created_at: "", updated_at: "" },
    { id: "cat-a", name: "Adult Social Care", created_at: "", updated_at: "" },
  ];
  const subcategories = [
    {
      id: "sub-a",
      name: "Assessment",
      category_id: "cat-a",
      prompts: {},
      created_at: 0,
      updated_at: 0,
    },
    {
      id: "sub-b",
      name: "Review",
      category_id: "cat-b",
      prompts: {},
      created_at: 0,
      updated_at: 0,
    },
  ];

  return {
    categories,
    mutateAsync: vi.fn(),
    subcategories,
    toast: vi.fn(),
  };
});

vi.mock("@/features/recordings/data/queries", () => ({
  useReprocessJobMutation: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/hooks/useCategoryData", () => ({
  useCategoryData: () => ({
    categories: mocks.categories,
    getSubcategoriesForCategory: (categoryId: string) =>
      mocks.subcategories.filter(
        (subcategory) => subcategory.category_id === categoryId,
      ),
    isLoading: false,
  }),
}));

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <ReprocessAnalysisDialog
      isOpen
      onOpenChange={onOpenChange}
      jobId="job-1"
      jobTitle="Case review"
    />,
  );
  return onOpenChange;
}

describe("ReprocessAnalysisDialog", () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  beforeEach(() => {
    mocks.mutateAsync.mockResolvedValue({ status: "success", job_id: "job-1" });
    mocks.mutateAsync.mockClear();
    mocks.toast.mockClear();
  });

  it("preserves the current recording type when no new type is selected", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "Reprocess Analysis" }),
    );

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      jobId: "job-1",
      request: {
        instructions: undefined,
        create_new_job: false,
      },
    });
  });

  it("sends selected recording type fields when updating the current job", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.click(screen.getByRole("combobox", { name: /recording type/i }));
    await user.click(
      await screen.findByRole("option", { name: "Adult Social Care" }),
    );
    await user.click(screen.getByRole("combobox", { name: /subtype/i }));
    await user.click(await screen.findByRole("option", { name: "Assessment" }));
    await user.click(
      screen.getByRole("button", { name: "Reprocess Analysis" }),
    );

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      jobId: "job-1",
      request: {
        instructions: undefined,
        create_new_job: false,
        prompt_category_id: "cat-a",
        prompt_subcategory_id: "sub-a",
      },
    });
  });

  it("sends selected recording type fields when creating a new job", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.type(
      screen.getByLabelText(/additional instructions/i),
      "Focus on risk",
    );
    await user.click(screen.getByRole("combobox", { name: /recording type/i }));
    await user.click(
      await screen.findByRole("option", { name: "Adult Social Care" }),
    );
    await user.click(screen.getByRole("combobox", { name: /subtype/i }));
    await user.click(await screen.findByRole("option", { name: "Assessment" }));
    await user.click(screen.getByLabelText(/create as new job/i));
    await user.click(
      screen.getByRole("button", { name: "Reprocess Analysis" }),
    );

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      jobId: "job-1",
      request: {
        instructions: "Focus on risk",
        create_new_job: true,
        prompt_category_id: "cat-a",
        prompt_subcategory_id: "sub-a",
      },
    });
  });
});
