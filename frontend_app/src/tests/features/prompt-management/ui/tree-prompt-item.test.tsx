import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TreePromptItem } from "@/features/prompt-management/ui/tree-prompt-item";
import { PermissionLevel } from "@/types/permissions";

const promptNode = {
  type: "prompt" as const,
  id: "prompt-1",
  name: "Weekly Review",
  depth: 1,
  categoryId: "folder-1",
  prompt: {
    id: "prompt-1",
    name: "Weekly Review",
    category_id: "folder-1",
    business_unit_id: "business-unit-a",
    prompts: { default: "Summarize the meeting." },
    created_at: 1,
    updated_at: 1,
    prompt_visibility: "only_editors" as const,
  },
};

describe("TreePromptItem", () => {
  it("shows the visibility control on sidebar items for editors in the same business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{ permission: PermissionLevel.EDITOR, business_unit_ids: ["business-unit-a"] }}
        isMobile={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCycleVisibility={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        isDragging={false}
      />,
    );

    expect(screen.getByRole("button", { name: /visibility only editors\. click to cycle\./i })).toBeInTheDocument();
  });

  it("shows the prompt actions menu for editors in the same business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{ permission: PermissionLevel.EDITOR, business_unit_ids: ["business-unit-a"] }}
        isMobile={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCycleVisibility={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        isDragging={false}
      />,
    );

    expect(screen.getByRole("button", { name: /prompt actions/i })).toBeInTheDocument();
  });

  it("hides the visibility control for editors outside the prompt business unit", () => {
    render(
      <TreePromptItem
        node={promptNode}
        isSelected={false}
        user={{ permission: PermissionLevel.EDITOR, business_unit_ids: ["business-unit-b"] }}
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
    expect(screen.queryByRole("button", { name: /prompt actions/i })).toBeNull();
  });
});