import { Info } from "lucide-react";
import type { PromptMetadata } from "@/shared/data/templates";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  PROMPT_METADATA_LABELS,
  PROMPT_METADATA_MESSAGES,
  normalizePromptMetadata,
} from "@/features/prompt-management/lib/prompt-metadata";

interface PromptMetadataDisclaimerProps {
  metadata?: PromptMetadata | null;
}

export function PromptMetadataDisclaimer({
  metadata,
}: PromptMetadataDisclaimerProps) {
  const normalized = normalizePromptMetadata(metadata);
  const activeKinds = (["development", "test"] as const).filter(
    (kind) => normalized[kind],
  );

  if (activeKinds.length === 0) {
    return null;
  }

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <Info className="h-4 w-4" />
      <AlertTitle className="text-sm">
        {activeKinds.map((kind) => PROMPT_METADATA_LABELS[kind]).join(" / ")}{" "}
        prompt
      </AlertTitle>
      <AlertDescription className="text-xs">
        {activeKinds.map((kind) => PROMPT_METADATA_MESSAGES[kind]).join(" ")}
      </AlertDescription>
    </Alert>
  );
}
