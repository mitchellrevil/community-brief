import type { PromptMetadata } from "@/shared/data/templates";

export const PROMPT_METADATA_LABELS = {
  development: "Development",
  test: "Test",
} as const;

export const PROMPT_METADATA_BADGE_LABELS = {
  development: "DEV",
  test: "TEST",
} as const;

export const PROMPT_METADATA_MESSAGES = {
  development:
    "This is a development template in early testing, and may not produce optimal outputs.",
  test: "This is a test template in early testing, and may not produce optimal outputs.",
} as const;

export function normalizePromptMetadata(
  metadata?: PromptMetadata | null,
): PromptMetadata {
  return {
    development: Boolean(metadata?.development),
    test: Boolean(metadata?.test),
  };
}

export function hasPromptMetadataDisclaimer(metadata?: PromptMetadata | null) {
  const normalized = normalizePromptMetadata(metadata);
  return normalized.development || normalized.test;
}

export function getPromptMetadataBadgeText(metadata?: PromptMetadata | null) {
  const normalized = normalizePromptMetadata(metadata);
  return (["development", "test"] as const)
    .filter((kind) => normalized[kind])
    .map((kind) => PROMPT_METADATA_BADGE_LABELS[kind])
    .join(" | ");
}
