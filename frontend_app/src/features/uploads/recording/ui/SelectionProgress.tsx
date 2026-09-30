import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectionProgressProps {
  step: 1 | 2 | 3;
}

export function SelectionProgress({ step }: SelectionProgressProps) {
  return (
    <div data-tutorial="progress-stepper" className="flex w-full flex-wrap items-center gap-1 overflow-x-auto rounded-lg bg-muted/50 p-2 text-xs font-medium sm:gap-2 sm:text-sm">
      <ProgressItem active={step === 1} number={1} desktopLabel="Service Area" mobileLabel="Area" />
      <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50 sm:h-4 sm:w-4" />
      <ProgressItem active={step === 2} number={2} desktopLabel="Meeting Type" mobileLabel="Type" />
      <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50 sm:h-4 sm:w-4" />
      <ProgressItem active={step === 3} number={3} desktopLabel="Details" />
    </div>
  );
}

function ProgressItem({
  active,
  number,
  desktopLabel,
  mobileLabel,
}: {
  active: boolean;
  number: number;
  desktopLabel: string;
  mobileLabel?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 transition-colors sm:gap-2 sm:px-3",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
    )}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
        {number}
      </span>
      {mobileLabel ? (
        <>
          <span className="hidden sm:inline">{desktopLabel}</span>
          <span className="sm:hidden">{mobileLabel}</span>
        </>
      ) : (
        desktopLabel
      )}
    </div>
  );
}
