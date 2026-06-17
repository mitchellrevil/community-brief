import { describe, expect, it } from "vitest";

import {
  canAccessPrompt,
  canDeletePrompt,
  canDragPrompt,
  canEditPrompt,
  canTogglePromptVisibility,
} from "@/features/prompt-management/state/permissions";
import { PermissionLevel } from "@/types/permissions";

const prompt = {
  id: "prompt-1",
  name: "Example Prompt",
  category_id: "subcategory-a",
  business_unit_id: "business-unit-a",
  prompts: { default: "Hello" },
  created_at: 1,
  updated_at: 1,
};

describe("prompt-management permissions", () => {
  it("allows editors to edit prompts inside their business unit", () => {
    const user = {
      permission: PermissionLevel.EDITOR,
      business_unit_ids: ["business-unit-a"],
    };

    expect(canAccessPrompt(prompt, user)).toBe(true);
    expect(canEditPrompt(prompt, user)).toBe(true);
    expect(canDeletePrompt(prompt, user)).toBe(true);
    expect(canDragPrompt(prompt, user)).toBe(true);
    expect(canTogglePromptVisibility(prompt, user)).toBe(true);
  });

  it("blocks editors from editing prompts outside their business unit", () => {
    const user = {
      permission: PermissionLevel.EDITOR,
      business_unit_ids: ["business-unit-b"],
    };

    expect(canAccessPrompt(prompt, user)).toBe(false);
    expect(canEditPrompt(prompt, user)).toBe(false);
    expect(canDeletePrompt(prompt, user)).toBe(false);
    expect(canDragPrompt(prompt, user)).toBe(false);
    expect(canTogglePromptVisibility(prompt, user)).toBe(false);
  });

  it("allows admins regardless of business unit assignment", () => {
    const user = {
      permission: PermissionLevel.ADMIN,
      business_unit_ids: ["business-unit-b"],
    };

    expect(canAccessPrompt(prompt, user)).toBe(true);
    expect(canEditPrompt(prompt, user)).toBe(true);
    expect(canDeletePrompt(prompt, user)).toBe(true);
    expect(canDragPrompt(prompt, user)).toBe(true);
    expect(canTogglePromptVisibility(prompt, user)).toBe(true);
  });
});