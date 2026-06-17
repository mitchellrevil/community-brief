import { Calendar, Filter, LayoutGrid, LayoutList, Loader2, RefreshCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statusEnum } from "@/shared/schema/audio-list.schema";
import { StatusBadge } from "@/components/ui/status-badge";
import { MotionDiv } from "@/components/ui/motion";
import { fadeInUp } from "@/lib/motion";

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
}: AudioRecordingsFiltersProps) {
  return (
    <MotionDiv
      className="w-full bg-card rounded-lg border shadow-sm"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
          {/* Search - grows on desktop */}
          <div className="min-w-0 flex-1">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                placeholder="Search recordings..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-10 w-full"
                aria-label="Search recordings"
              />
            </div>
          </div>

          {/* Status & Clear */}
          <div className="flex items-center gap-2 mt-3 sm:mt-0">
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px]">
              <div className="flex items-center gap-2 w-full">
                <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <SelectValue placeholder="Filter by status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {statusEnum.options.map((s) => (
                <SelectItem key={s} value={s}>
                  <div className="flex items-center gap-2">
                    {s !== "all" && <StatusBadge status={s as any} size="sm" />}
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
                className="gap-2 hidden sm:inline-flex"
              >
                <X className="h-4 w-4" />
                <span>Clear</span>
              </Button>
            )}
          </div>

          {/* Dates - compact on desktop */}
          <div className="mt-3 sm:mt-0 sm:flex sm:items-center sm:gap-2 sm:ml-2">
            <div className="relative sm:w-44">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <input
                type="date"
                value={createdAtStart || ""}
                onChange={(e) => onCreatedAtStartChange(e.target.value || undefined)}
                className="w-full pl-9 pr-3 h-10 bg-background rounded-md border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="Start date"
                aria-label="Start date"
              />
            </div>
            <div className="relative mt-2 sm:mt-0 sm:w-44">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <input
                type="date"
                value={createdAtEnd || ""}
                onChange={(e) => onCreatedAtEndChange(e.target.value || undefined)}
                className="w-full pl-9 pr-3 h-10 bg-background rounded-md border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="End date"
                aria-label="End date"
              />
            </div>
          </div>
          
        </div>

        {/* Results Count & Refresh */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground">{totalCount}</span> recording{totalCount !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefetching}
              aria-label={isRefetching ? "Refreshing recordings" : "Refresh recordings"}
            >
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <div className="inline-flex items-center bg-muted p-1 rounded-lg border" role="group" aria-label="View mode">
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onViewModeChange("card")}
                className="h-8 px-3"
                aria-label="Card view"
                aria-pressed={viewMode === "card"}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                <span className="ml-2 hidden sm:inline">Cards</span>
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onViewModeChange("table")}
                className="h-8 px-3 hidden sm:flex"
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
