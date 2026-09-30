import { describe, expect, it, vi } from "vitest";
import type { PromptTemplate } from "@/shared/data/templates";
import {
  MAX_PROMPT_CONTENT_CHARS,
  MAX_PROMPT_FILE_BYTES,
  parsePromptFile,
  readPromptFile,
  serializePromptFile,
} from "@/features/prompt-management/lib/prompt-file";

const prompt: PromptTemplate = {
  id: "subcategory-1",
  folder_id: "category-1",
  business_unit_id: "business-unit-1",
  name: "Interview summary",
  prompts: { summary: "Summarise the interview" },
  pre_session_talking_points: [{ fields: [{ name: "goal" }] }],
  in_session_talking_points: [{ fields: [{ name: "decisions" }] }],
  created_at: 1,
  updated_at: 2,
  updated_by_user_id: "editor-1",
  updated_by_display_name: "Editor One",
  analysis_model: "gpt-5.1",
  analysis_reasoning: "low",
  analysis_verbosity: "medium",
  analysis_provider: "responses",
  provider_parameters: { reasoning_effort: "low" },
  analysis_workflow: "standard",
  visibility: "all",
  visible_to_user_ids: ["user-1"],
  speaker_identification_enabled: true,
  prompt_metadata: { development: true, test: false },
  recording_disclaimer_enabled: true,
  recording_disclaimer: "This meeting is recorded.",
};

describe("prompt files", () => {
  it("accepts prompts up to 25,000 characters", () => {
    const serialized = serializePromptFile({
      ...prompt,
      prompts: { summary: "x".repeat(MAX_PROMPT_CONTENT_CHARS) },
    });

    expect(parsePromptFile(serialized).template.prompts.summary).toHaveLength(
      MAX_PROMPT_CONTENT_CHARS,
    );
    expect(() =>
      serializePromptFile({
        ...prompt,
        prompts: { summary: "x".repeat(MAX_PROMPT_CONTENT_CHARS + 1) },
      }),
    ).toThrow();
  });

  it("round-trips portable fields without environment metadata", () => {
    const serialized = serializePromptFile(prompt);
    const raw = JSON.parse(serialized);
    const imported = parsePromptFile(serialized);

    expect(raw).toMatchObject({
      format: "community-brief-prompt",
      format_version: 1,
      template: {
        name: prompt.name,
        prompts: prompt.prompts,
        analysis_reasoning: "low",
        analysis_verbosity: "medium",
        user_allowlist_omitted: true,
      },
    });
    expect(raw.template).not.toHaveProperty("visible_to_user_ids");
    expect(raw.template).not.toHaveProperty("category_id");
    expect(raw.template).not.toHaveProperty("business_unit_id");
    expect(raw.template).not.toHaveProperty("updated_by_user_id");
    expect(imported.template).toMatchObject({
      name: prompt.name,
      prompts: prompt.prompts,
      pre_session_talking_points: prompt.pre_session_talking_points,
      in_session_talking_points: prompt.in_session_talking_points,
      analysis_model: prompt.analysis_model,
      analysis_reasoning: prompt.analysis_reasoning,
      analysis_verbosity: prompt.analysis_verbosity,
      analysis_provider: prompt.analysis_provider,
      provider_parameters: prompt.provider_parameters,
      visibility: "only_editors",
      speaker_identification_enabled: true,
      prompt_metadata: prompt.prompt_metadata,
      recording_disclaimer_enabled: true,
      recording_disclaimer: prompt.recording_disclaimer,
    });
    expect(imported.userAllowlistOmitted).toBe(true);
  });

  it("applies V1 defaults when optional fields are absent", () => {
    const imported = parsePromptFile(
      JSON.stringify({
        format: "community-brief-prompt",
        format_version: 1,
        template: { name: "Minimal", prompts: {} },
      }),
    );

    expect(imported.template).toMatchObject({
      pre_session_talking_points: [],
      in_session_talking_points: [],
      visibility: "all",
      speaker_identification_enabled: false,
      prompt_metadata: null,
      recording_disclaimer_enabled: false,
      recording_disclaimer: null,
    });
  });

  it("rejects invalid, unsupported, malformed, and oversized files", async () => {
    expect(() => parsePromptFile("not-json")).toThrow("not valid JSON");
    expect(() => parsePromptFile(JSON.stringify({ format: "other" }))).toThrow(
      "not a Community Brief",
    );
    expect(() =>
      parsePromptFile(
        JSON.stringify({
          format: "community-brief-prompt",
          format_version: 2,
        }),
      ),
    ).toThrow("Update Community Brief");
    expect(() =>
      parsePromptFile(
        JSON.stringify({
          format: "community-brief-prompt",
          format_version: 1,
          template: { name: "Broken", prompts: "wrong" },
        }),
      ),
    ).toThrow("Invalid .prompt file");

    const text = vi.fn().mockResolvedValue("{}");
    await expect(
      readPromptFile({
        size: MAX_PROMPT_FILE_BYTES + 1,
        text,
      } as unknown as File),
    ).rejects.toThrow("5 MB or smaller");
    expect(text).not.toHaveBeenCalled();
  });
});
