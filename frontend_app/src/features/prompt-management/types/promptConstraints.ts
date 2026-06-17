export type ConstraintFormat = "bullets" | "prose" | "table";

export interface PromptConstraints {
  format?: ConstraintFormat;
  max_items?: number;
  max_words?: number;
  max_words_per_item?: number;
  required_elements?: Array<string>;
  tone?: string;
}

export type PromptConstraintsMap = Record<string, PromptConstraints>;
