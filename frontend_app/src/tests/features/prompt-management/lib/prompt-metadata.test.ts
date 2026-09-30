import { describe, expect, it } from "vitest";
import {
  getPromptMetadataBadgeText,
  hasPromptMetadataDisclaimer,
  normalizePromptMetadata,
} from "@/features/prompt-management/lib/prompt-metadata";

describe("prompt metadata", () => {
  it("normalizes missing disclaimer flags to false", () => {
    expect(normalizePromptMetadata()).toEqual({ development: false, test: false });
    expect(normalizePromptMetadata({ development: true })).toEqual({ development: true, test: false });
  });

  it("detects disclaimer metadata", () => {
    expect(hasPromptMetadataDisclaimer({ development: true })).toBe(true);
    expect(hasPromptMetadataDisclaimer({ test: true })).toBe(true);
    expect(hasPromptMetadataDisclaimer({ development: false, test: false })).toBe(false);
  });

  it("formats compact badge text", () => {
    expect(getPromptMetadataBadgeText({ development: true })).toBe("DEV");
    expect(getPromptMetadataBadgeText({ test: true })).toBe("TEST");
    expect(getPromptMetadataBadgeText({ development: true, test: true })).toBe("DEV | TEST");
  });
});
