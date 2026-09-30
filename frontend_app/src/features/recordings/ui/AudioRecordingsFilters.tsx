import {
  Calendar,
  Filter,
  LayoutGrid,
  LayoutList,
  Loader2,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MotionDiv } from "@/components/ui/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { fadeInUp } from "@/lib/motion";
import { statusEnum } from "@/shared/schema/audio-list.schema";

interface AudioRecordingsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  createdAtStart?: string;
  createdAtEnd?: string;
  onCreatedAtStartChange: (value?: string) => void;
  onCreatedAtEndChange: (value?: string) => void;
  onRefresh: () => void;
  isRefetching: boolean;
  totalCount: number;
  viewMode: "card" | "table";
  onViewModeChange: (mode: "card" | "table") => void;
  sourceFilters?: {
    includeFiles: boolean;
    includeTeams: boolean;
    onFilesChange: (checked: boolean) => void;
    onTeamsChange: (checked: boolean) => void;
  };
}

export function AudioRecordingsFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  createdAtStart,
  createdAtEnd,
  onCreatedAtStartChange,
  onCreatedAtEndChange,
  onRefresh,
  isRefetching,
  totalCount,
  viewMode,
  onViewModeChange,
  sourceFilters,
}: AudioRecordingsFiltersProps) {
  return (
    <MotionDiv
      className="bg-card w-full rounded-lg border shadow-sm"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <div className="p-3 sm:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-3">
          {/* Search - grows on desktop */}
          <div className="min-w-0 flex-1">
            <div className="relative w-full">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                placeholder="Search recordings..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-10 w-full pl-9"
                aria-label="Search recordings"
              />
            </div>
          </div>

          {/* Status & Clear */}
          <div className="mt-3 flex items-center gap-2 lg:mt-0">
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger className="w-full lg:w-auto lg:min-w-[200px]">
                <div className="flex w-full items-center gap-2">
                  <Filter className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                  <SelectValue placeholder="Filter by status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {statusEnum.options.map((s) => (
                  <SelectItem key={s} value={s}>
                    <div className="flex items-center gap-2">
                      {s !== "all" && (
                        <StatusBadge status={s as any} size="sm" />
                      )}
                      <span className="capitalize">
                        {s === "all" ? "All Statuses" : s}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(search || status !== "all" || createdAtStart || createdAtEnd) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onSearchChange("");
                  onStatusChange("all");
                  onCreatedAtStartChange(undefined);
                  onCreatedAtEndChange(undefined);
                }}
                className="hidden gap-2 sm:inline-flex"
              >
                <X className="h-4 w-4" />
                <span>Clear</span>
              </Button>
            )}
          </div>

          {/* Dates - compact on desktop */}
          <div className="mt-3 lg:mt-0 lg:ml-2 lg:flex lg:items-center lg:gap-2">
            <div className="relative lg:w-44">
              <Calendar className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
              <input
                type="date"
                value={createdAtStart || ""}
                onChange={(e) =>
                  onCreatedAtStartChange(e.target.value || undefined)
                }
                className="bg-background border-input focus:ring-ring h-10 w-full rounded-md border pr-3 pl-9 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
                placeholder="Start date"
                aria-label="Start date"
              />
            </div>
            <div className="relative mt-2 lg:mt-0 lg:w-44">
              <Calendar className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
              <input
                type="date"
                value={createdAtEnd || ""}
                onChange={(e) =>
                  onCreatedAtEndChange(e.target.value || undefined)
                }
                className="bg-background border-input focus:ring-ring h-10 w-full rounded-md border pr-3 pl-9 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
                placeholder="End date"
                aria-label="End date"
              />
            </div>
          </div>
        </div>

        {/* Results Count & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="text-muted-foreground text-sm" aria-live="polite">
            <span className="text-foreground font-semibold">{totalCount}</span>{" "}
            recording{totalCount !== 1 ? "s" : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sourceFilters && (
              <div
                className="mr-2 flex flex-wrap items-center gap-3"
                role="group"
                aria-label="Recording sources"
              >
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    className="!size-4 !min-h-0"
                    checked={sourceFilters.includeFiles}
                    onCheckedChange={(checked) =>
                      sourceFilters.onFilesChange(checked === true)
                    }
                  />
                  Community Brief files
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    className="!size-4 !min-h-0"
                    checked={sourceFilters.includeTeams}
                    onCheckedChange={(checked) =>
                      sourceFilters.onTeamsChange(checked === true)
                    }
                  />
                  Teams meetings
                </label>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefetching}
              aria-label={
                isRefetching ? "Refreshing recordings" : "Refresh recordings"
              }
            >
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <div
              className="bg-muted inline-flex items-center rounded-lg border p-1"
              role="group"
              aria-label="View mode"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange("card")}
                className={`h-8 px-3 ${viewMode === "card" ? "bg-background text-foreground hover:bg-background shadow-xs" : "text-muted-foreground"}`}
                aria-label="Card view"
                aria-pressed={viewMode === "card"}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                <span className="ml-2 hidden sm:inline">Cards</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange("table")}
                className={`hidden h-8 px-3 sm:flex ${viewMode === "table" ? "bg-background text-foreground hover:bg-background shadow-xs" : "text-muted-foreground"}`}
                aria-label="Table view"
                aria-pressed={viewMode === "table"}
              >
                <LayoutList className="h-4 w-4" aria-hidden="true" />
                <span className="ml-2 hidden sm:inline">Table</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
