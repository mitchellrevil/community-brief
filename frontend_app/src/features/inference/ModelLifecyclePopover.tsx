import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { getInferenceCatalogQuery } from "@/config/inferenceConfig";

export function ModelLifecyclePopover({ modelKey }: { modelKey?: string }) {
  const { data: catalog } = useQuery(getInferenceCatalogQuery());
  const warning = catalog?.lifecycle_warnings.find(
    (item) => item.model_key === modelKey,
  );
  if (!warning) return null;

  const date = warning.deprecates_at || warning.retires_at;

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 p-0 text-amber-500 hover:text-amber-400"
          aria-label={`${warning.display_name} model lifecycle warning`}
          onClick={(event) => event.stopPropagation()}
        >
          <TriangleAlert className="h-3.5 w-3.5" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-64 space-y-2 p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{warning.display_name}</span>
          <Badge
            variant={
              warning.effective_status === "retired" ||
              warning.effective_status === "disabled"
                ? "destructive"
                : "outline"
            }
            className="text-[10px]"
          >
            {warning.effective_status === "active"
              ? "upcoming"
              : warning.effective_status}
          </Badge>
        </div>
        <p className="text-muted-foreground">This template uses this model.</p>
        {date && (
          <p className="text-muted-foreground">
            Lifecycle date: {new Date(date).toLocaleDateString()}
          </p>
        )}
        {warning.replacement_model_key && (
          <p>Replacement: {warning.replacement_model_key}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
