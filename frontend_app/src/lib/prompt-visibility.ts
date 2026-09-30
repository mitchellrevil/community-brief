import type { PromptVisibility } from "@/shared/data/templates";

export const DEFAULT_PROMPT_VISIBILITY: PromptVisibility = "all";

export function normalizePromptVisibility(
  value: string | null | undefined,
): PromptVisibility {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return DEFAULT_PROMPT_VISIBILITY;
  }

  if (
    normalized === "all" ||
    normalized === "only_editors" ||
    normalized === "nobody"
  ) {
    return normalized;
  }

  throw new Error(`Invalid visibility: ${value}`);
}

export function getNextPromptVisibility(
  current: string | null | undefined,
): PromptVisibility {
  const normalized = normalizePromptVisibility(current);
  if (normalized === "all") return "only_editors";
  if (normalized === "only_editors") return "nobody";
  return "all";
}

export function getPromptVisibilityLabel(
  value: string | null | undefined,
): string {
  const normalized = normalizePromptVisibility(value);
  if (normalized === "only_editors") return "Only Editors";
  if (normalized === "nobody") return "Nobody";
  return "All";
}
