import { cn } from "@/lib/utils";

interface SonicBrandProps {
  compact?: boolean;
  className?: string;
}

export function SonicBrand({ compact = false, className }: SonicBrandProps) {
  return (
    <div
      role="img"
      aria-label="Sonic Brief"
      className={cn(
        "text-sidebar-foreground flex shrink-0 items-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block shrink-0 bg-current [mask-image:url('/sonic-mark.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]",
          compact ? "h-9 w-4" : "h-14 w-7",
        )}
      />
      {!compact && (
        <span
          aria-hidden="true"
          className="ml-4 flex flex-col text-[1.625rem] leading-[1.05] font-bold tracking-tight"
        >
          <span>Sonic</span>
          <span>Brief</span>
        </span>
      )}
    </div>
  );
}
