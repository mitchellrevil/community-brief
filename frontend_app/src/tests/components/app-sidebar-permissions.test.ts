import { describe, expect, it } from "vitest";
import { getVisibleNavSections } from "@/components/app-sidebar";
import { PermissionLevel } from "@/types/permissions";

function visibleItemIds(permission: PermissionLevel): Array<string> {
  return getVisibleNavSections(permission).flatMap((section) =>
    section.items.map((item) => item.id),
  );
}

describe("AppSidebar template permissions", () => {
  it("hides Templates from users", () => {
    expect(visibleItemIds(PermissionLevel.USER)).not.toContain(
      "prompt-management",
    );
  });

  it.each([
    PermissionLevel.EDITOR,
    PermissionLevel.ADMIN,
    PermissionLevel.MODERATOR,
  ])("shows Templates to %s accounts", (permission) => {
    expect(visibleItemIds(permission)).toContain("prompt-management");
  });
});
