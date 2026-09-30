import type { PromptMetadata } from "@/shared/data/templates";
import {
  PROMPT_METADATA_BADGE_LABELS,
  normalizePromptMetadata,
} from "@/features/prompt-management/lib/prompt-metadata";
import { cn } from "@/lib/utils";

interface PromptMetadataBadgeProps {
  metadata?: PromptMetadata | null;
  className?: string;
}

export function PromptMetadataBadge({
  metadata,
  className,
}: PromptMetadataBadgeProps) {
  const normalized = normalizePromptMetadata(metadata);
  const activeKinds = (["development", "test"] as const).filter(
    (kind) => normalized[kind],
  );

  if (activeKinds.length === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 text-[10px] font-bold tracking-wide",
        className,
      )}
    >
      {activeKinds.map((kind, index) => (
        <span key={kind} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground">|</span>}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 shadow-sm",
              kind === "development" &&
                "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
              kind === "test" && "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
            )}
          >
            {PROMPT_METADATA_BADGE_LABELS[kind]}
          </span>
        </span>
      ))}
    </span>
  );
}
