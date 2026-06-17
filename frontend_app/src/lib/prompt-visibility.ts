import type { PromptVisibility } from "@/features/prompt-management/data/api";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";

export const DEFAULT_PROMPT_VISIBILITY: PromptVisibility = "all";

export function normalizePromptVisibility(value: string | null | undefined): PromptVisibility {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_PROMPT_VISIBILITY;
  }

  if (normalized === "all" || normalized === "only_editors" || normalized === "nobody") {
    return normalized;
  }

  throw new Error(`Invalid prompt_visibility: ${value}`);
}

export function getNextPromptVisibility(current: string | null | undefined): PromptVisibility {
  const normalized = normalizePromptVisibility(current);
  if (normalized === "all") return "only_editors";
  if (normalized === "only_editors") return "nobody";
  return "all";
}

export function getPromptVisibilityLabel(value: string | null | undefined): string {
  const normalized = normalizePromptVisibility(value);
  if (normalized === "only_editors") return "Only Editors";
  if (normalized === "nobody") return "Nobody";
  return "All";
}

export function canUsePromptVisibility(
  visibility: string | null | undefined,
  userPermission: PermissionLevel | undefined,
): boolean {
  const normalized = normalizePromptVisibility(visibility);

  if (normalized === "nobody") {
    return false;
  }

  if (normalized === "only_editors") {
    if (!userPermission) {
      return false;
    }
    return hasPermissionLevel(userPermission, PermissionLevel.EDITOR);
  }

  return true;
}

function normalizeUserIdentifier(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.includes("@") ? normalized.toLowerCase() : normalized;
}

/**
 * Full runtime access check for a subcategory.
 * Checks prompt_visibility (role-level) AND visible_to_user_ids (explicit allowlist).
 */
export function canAccessSubcategory(
  subcategory: { prompt_visibility?: string | null; visible_to_user_ids?: Array<string> | null },
  userPermission: PermissionLevel | undefined,
  userIdentifiers: string | Array<string | null | undefined> | null | undefined,
): boolean {
  const normalizedVisibility = normalizePromptVisibility(subcategory.prompt_visibility);

  if (normalizedVisibility === "nobody") {
    return false;
  }

  const allowlist = subcategory.visible_to_user_ids;
  if (allowlist && allowlist.length > 0) {
    const identifiers = Array.isArray(userIdentifiers) ? userIdentifiers : [userIdentifiers];
    const normalizedUserIdentifiers = new Set(
      identifiers
        .map((identifier) => normalizeUserIdentifier(identifier))
        .filter((identifier): identifier is string => Boolean(identifier))
    );
    const normalizedAllowlist = allowlist
      .map((identifier) => normalizeUserIdentifier(identifier))
      .filter((identifier): identifier is string => Boolean(identifier));

    return normalizedAllowlist.some((identifier) => normalizedUserIdentifiers.has(identifier));
  }

  return canUsePromptVisibility(normalizedVisibility, userPermission);
}

