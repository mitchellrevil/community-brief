import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createQueryClient,
  createQueryClientWrapper,
} from "@/tests/test-utils";
import { PromptEditor } from "@/features/prompt-management/ui/editor";

const context = vi.hoisted(() => ({
  selectedPrompt: {
    id: "template",
    name: "Meeting",
    prompts: { Meeting: "Instructions" },
    pre_session_talking_points: [
      { fields: [{ name: "legacy", label: "Name", type: "text", value: "" }] },
    ],
    in_session_talking_points: [
      {
        fields: [
          {
            name: "reminder",
            label: "Confirmed",
            type: "checkbox",
            value: false,
          },
        ],
      },
    ],
  },
  selectedCategory: { name: "Folder" },
  editSubcategory: vi.fn(),
  setSelectedPrompt: vi.fn(),
  refreshData: vi.fn(),
}));
vi.mock("@/features/prompt-management/state/context", () => ({
  usePromptManagement: () => context,
}));
vi.mock("@/features/prompt-management/ui/InferenceSettings", () => ({
  InferenceSettings: () => null,
}));
vi.mock("@/features/prompt-management/ui/UserAllowlistEditor", () => ({
  UserAllowlistEditor: () => null,
}));
vi.mock("@/features/prompt-management/ui/versions-control", () => ({
  VersionsControl: () => null,
}));
vi.mock("@/components/lazy/LazyMDEditor", () => ({
  LazyMDEditor: ({
    value,
    onChange,
    textareaProps,
  }: {
    value: string;
    onChange: (value: string) => void;
    textareaProps: object;
  }) => (
    <textarea
      {...textareaProps}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
afterEach(cleanup);
beforeEach(() => {
  context.editSubcategory.mockReset().mockResolvedValue({});
  context.selectedPrompt.pre_session_talking_points[0].fields[0].label = "Name";
});

it("blocks invalid saves, opens forms, focuses the error, and saves a repaired field", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  context.selectedPrompt.pre_session_talking_points[0].fields[0].label = "";
  render(<PromptEditor onCancel={vi.fn()} onSave={onSave} />, {
    wrapper: createQueryClientWrapper(createQueryClient()),
  });
  await user.click(screen.getByRole("button", { name: "Save and Publish" }));
  expect(context.editSubcategory).not.toHaveBeenCalled();
  const question = await screen.findByRole("textbox", { name: "Question" });
  await waitFor(() => expect(question).toHaveFocus());
  await user.type(question, "Full name");
  expect(question).toHaveAttribute("aria-invalid", "false");
  await user.click(screen.getByRole("button", { name: "Save and Publish" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  const args = context.editSubcategory.mock.calls[0];
  expect(args[3][0].fields[0]).toMatchObject({
    name: "legacy",
    label: "Full name",
  });
  expect(args[4][0].fields[0]).toMatchObject({
    name: "reminder",
    label: "Confirmed",
    value: false,
  });
  expect(
    context.selectedPrompt.pre_session_talking_points[0].fields[0].label,
  ).toBe("");
});

it("cancels edits without changing the selected template or writing to the API", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(<PromptEditor onCancel={onCancel} onSave={vi.fn()} />, {
    wrapper: createQueryClientWrapper(createQueryClient()),
  });
  await user.click(screen.getByRole("tab", { name: "Forms" }));
  await user.click(screen.getByRole("button", { name: /Name ·/ }));
  await user.type(screen.getByRole("textbox", { name: "Question" }), " edited");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(
    context.selectedPrompt.pre_session_talking_points[0].fields[0].label,
  ).toBe("Name");
  expect(context.editSubcategory).not.toHaveBeenCalled();
});
