import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreePromptItem } from "@/features/prompt-management/ui/tree-prompt-item";
import { PermissionLevel } from "@/types/permissions";

vi.mock("@/features/inference/ModelLifecyclePopover", () => ({
  ModelLifecyclePopover: () => null,
}));

const promptNode = {
  type: "prompt" as const,
  id: "prompt-1",
  name: "Weekly Review",
  depth: 1,
  categoryId: "folder-1",
  prompt: {
    id: "prompt-1",
    name: "Weekly Review",
    folder_id: "folder-1",
    business_unit_id: "business-unit-a",
    prompts: { default: "Summarize the meeting." },
    created_at: 1,
    updated_at: 1,
    pre_session_talking_points: [],
    in_session_talking_points: [],
    analysis_workflow: "standard" as const,
    visibility: "only_editors" as const,
    speaker_identification_enabled: false,
    recording_disclaimer_enabled: false,
  },
};

describe("TreePromptItem", () => {
  it("shows the visibility control on sidebar items for editors in the same business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{
          permission: PermissionLevel.EDITOR,
          business_unit_ids: ["business-unit-a"],
        }}
        isMobile={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCycleVisibility={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        isDragging={false}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /visibility only editors\. click to cycle\./i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the prompt actions menu for editors in the same business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{
          permission: PermissionLevel.EDITOR,
          business_unit_ids: ["business-unit-a"],
        }}
        isMobile={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCycleVisibility={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        isDragging={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: /template actions/i }),
    ).toBeInTheDocument();
  });

  it("hides the visibility control for editors outside the prompt business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{
          permission: PermissionLevel.EDITOR,
          business_unit_ids: ["business-unit-b"],
        }}
        isMobile={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCycleVisibility={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        isDragging={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /visibility/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /prompt actions/i }),
    ).toBeNull();
  });
});
