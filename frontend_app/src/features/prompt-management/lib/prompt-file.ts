import { z } from "zod";
import type {
  CreatePromptTemplate,
  PromptTemplate,
} from "@/shared/data/templates";

export const PROMPT_FILE_FORMAT = "community-brief-prompt";
export const PROMPT_FILE_FORMAT_VERSION = 1;
export const MAX_PROMPT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PROMPT_CONTENT_CHARS = 25_000;

const promptMetadataSchema = z
  .object({
    development: z.boolean().optional(),
    test: z.boolean().optional(),
  })
  .strict();

const talkingPointSchema = z.record(z.string(), z.unknown());

const promptFileV1Schema = z
  .object({
    format: z.literal(PROMPT_FILE_FORMAT),
    format_version: z.literal(PROMPT_FILE_FORMAT_VERSION),
    template: z
      .object({
        name: z.string().trim().min(1).max(255),
        prompts: z
          .record(z.string(), z.string().max(MAX_PROMPT_CONTENT_CHARS))
          .refine((prompts) => Object.keys(prompts).length <= 50, {
            message: "A template file can contain at most 50 prompt sections",
          }),
        preSessionTalkingPoints: z.array(talkingPointSchema).default([]),
        inSessionTalkingPoints: z.array(talkingPointSchema).default([]),
        analysis_model: z.string().optional(),
        analysis_reasoning: z.string().optional(),
        analysis_verbosity: z.string().optional(),
        analysis_provider: z.string().optional(),
        analysis_workflow: z.enum(["standard", "structured_review"]).optional(),
        provider_parameters: z.record(z.string(), z.unknown()).optional(),
        prompt_visibility: z
          .enum(["all", "only_editors", "nobody"])
          .default("all"),
        user_allowlist_omitted: z.boolean().default(false),
        speaker_identification_enabled: z.boolean().default(false),
        prompt_metadata: promptMetadataSchema.nullable().default(null),
        recording_disclaimer_enabled: z.boolean().default(false),
        recording_disclaimer: z.string().nullable().default(null),
      })
      .strict(),
  })
  .strict();

export interface PromptFileImport {
  template: Omit<CreatePromptTemplate, "folder_id">;
  userAllowlistOmitted: boolean;
}

export function serializePromptFile(prompt: PromptTemplate): string {
  const file = promptFileV1Schema.parse({
    format: PROMPT_FILE_FORMAT,
    format_version: PROMPT_FILE_FORMAT_VERSION,
    template: {
      name: prompt.name,
      prompts: prompt.prompts,
      preSessionTalkingPoints: prompt.pre_session_talking_points,
      inSessionTalkingPoints: prompt.in_session_talking_points,
      analysis_model: prompt.analysis_model,
      analysis_reasoning: prompt.analysis_reasoning,
      analysis_verbosity: prompt.analysis_verbosity,
      analysis_provider: prompt.analysis_provider,
      provider_parameters: prompt.provider_parameters,
      analysis_workflow: prompt.analysis_workflow,
      prompt_visibility: prompt.visibility,
      user_allowlist_omitted: Boolean(prompt.visible_to_user_ids?.length),
      speaker_identification_enabled: prompt.speaker_identification_enabled,
      prompt_metadata: prompt.prompt_metadata ?? null,
      recording_disclaimer_enabled: prompt.recording_disclaimer_enabled,
      recording_disclaimer: prompt.recording_disclaimer ?? null,
    },
  });

  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parsePromptFile(
  contents: string,
  byteLength = new TextEncoder().encode(contents).byteLength,
): PromptFileImport {
  if (byteLength > MAX_PROMPT_FILE_BYTES) {
    throw new Error("Template files must be 5 MB or smaller.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    throw new Error("This .prompt file is not valid JSON.");
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("This is not a Community Brief template file.");
  }

  const envelope = raw as Record<string, unknown>;
  if (envelope.format !== PROMPT_FILE_FORMAT) {
    throw new Error("This is not a Community Brief template file.");
  }
  if (envelope.format_version !== PROMPT_FILE_FORMAT_VERSION) {
    const version = envelope.format_version ?? "unknown";
    throw new Error(
      `Template format version ${String(version)} is not supported. Update Community Brief and try again.`,
    );
  }

  const result = promptFileV1Schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue.path.length ? `${issue.path.join(".")}: ` : "";
    throw new Error(`Invalid .prompt file: ${location}${issue.message}`);
  }

  const { user_allowlist_omitted, ...portableTemplate } = result.data.template;
  const template: Omit<CreatePromptTemplate, "folder_id"> = {
    name: portableTemplate.name,
    prompts: portableTemplate.prompts,
    pre_session_talking_points: portableTemplate.preSessionTalkingPoints,
    in_session_talking_points: portableTemplate.inSessionTalkingPoints,
    analysis_model: portableTemplate.analysis_model,
    analysis_reasoning: portableTemplate.analysis_reasoning,
    analysis_verbosity: portableTemplate.analysis_verbosity,
    analysis_provider: portableTemplate.analysis_provider,
    analysis_workflow: portableTemplate.analysis_workflow ?? "standard",
    provider_parameters: portableTemplate.provider_parameters,
    visibility: user_allowlist_omitted
      ? "only_editors"
      : portableTemplate.prompt_visibility,
    speaker_identification_enabled:
      portableTemplate.speaker_identification_enabled,
    prompt_metadata: portableTemplate.prompt_metadata,
    recording_disclaimer_enabled: portableTemplate.recording_disclaimer_enabled,
    recording_disclaimer: portableTemplate.recording_disclaimer,
  };

  return {
    template,
    userAllowlistOmitted: user_allowlist_omitted,
  };
}

export async function readPromptFile(file: File): Promise<PromptFileImport> {
  if (file.size > MAX_PROMPT_FILE_BYTES) {
    throw new Error("Template files must be 5 MB or smaller.");
  }

  return parsePromptFile(await file.text(), file.size);
}
