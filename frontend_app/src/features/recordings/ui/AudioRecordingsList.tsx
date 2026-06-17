import { memo } from "react";
import {
  Download,
  Eye,
  FileAudio,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { AudioRecordingCardV2 } from "./AudioRecordingCardV2";
import { recordingsListPropsAreEqual } from "@/hooks/useMemoizedCallbacks";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { EditableDisplayName } from "@/components/ui/editable-display-name";
import { formatDate } from "@/lib/date-utils";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import { listItemFadeInUp } from "@/lib/motion";

import { Skeleton } from "@/components/ui/skeleton";

interface AudioRecordingsListProps {
  recordings: Array<any>;
  isLoading: boolean;
  viewMode: "card" | "table";
  onViewModeChange: (mode: "card" | "table") => void;
  onViewDetails: (recording: any) => void;
  onPlay: (recording: any) => void;
  onDownload: (recording: any) => void;
  onRetryProcessing: (recording: any) => void;
  onShare: (recording: any) => void;
  onDelete: (recording: any) => void;
  "data-tutorial"?: string;
}

function AudioRecordingsListComponent({
  recordings,
  isLoading,
  viewMode,
  onViewModeChange,
  onViewDetails,
  onPlay,
  onDownload,
  onRetryProcessing,
  onShare,
  onDelete,
  "data-tutorial": dataTutorial,
}: AudioRecordingsListProps) {
  if (isLoading) {
    return <LoadingSkeleton viewMode={viewMode} />;
  }

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/10 border-dashed">
        <div className="p-4 rounded-full bg-muted mb-4">
          <FileAudio className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No recordings found</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-2">
          Try adjusting your filters or upload a new recording to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4" data-tutorial={dataTutorial}>
      {/* Card View - Always on mobile, optional on desktop */}
      {viewMode === "card" || window.innerWidth < 640 ? (
        <MotionList as="div" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((recording) => (
            <MotionListItem key={recording.id} as="div">
              <AudioRecordingCardV2
                recording={recording}
                onViewDetails={() => onViewDetails(recording)}
                onPlay={() => onPlay(recording)}
                onDownload={() => onDownload(recording)}
                onRetryProcessing={() => onRetryProcessing(recording)}
                onShare={() => onShare(recording)}
                onDelete={() => onDelete(recording)}
              />
            </MotionListItem>
          ))}
        </MotionList>
      ) : (
        /* Table View - Desktop only with horizontal scroll wrapper */
        <div className="w-full rounded-lg border bg-card shadow-sm">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem] sm:min-w-[14rem]">Name</TableHead>
                  <TableHead className="min-w-[7.5rem]">Status</TableHead>
                  <TableHead className="min-w-[8.5rem]">Date</TableHead>
                  <TableHead className="text-right w-16 sm:w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                          <FileAudio className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <EditableDisplayName
                            job={row}
                            className="font-medium truncate"
                            showEditIcon={false}
                          />
                          <span className="text-xs text-muted-foreground truncate">
                            {row.file_name || row.filename}
                          </span>
                        </div>
                        {row._isQueued && (
                          <span className="text-xs font-medium text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                            Queued
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.status}
                        size="sm"
                        showIcon={true}
                        animate={row.status === "processing" || row.status === "analysing" || row.status === "transcribing"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[min(90vw,18rem)]">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => onViewDetails(row)}
                            disabled={row._isQueued}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onPlay(row)}
                            disabled={row._isQueued}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Play Audio
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDownload(row)}
                            disabled={row._isQueued}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onShare(row)}
                            disabled={row._isQueued}
                          >
                            <Share2 className="mr-2 h-4 w-4" />
                            Share
                          </DropdownMenuItem>
                          {row.status === "uploaded" && !row._isQueued && (
                            <DropdownMenuItem onClick={() => onRetryProcessing(row)}>
                              <RefreshCcw className="mr-2 h-4 w-4" />
                              Retry Processing
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(row)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Memoized AudioRecordingsList that only re-renders when:
 * - recordings array changes (id, status, or display name)
 * - isLoading changes
 * - viewMode changes
 *
 * Callback props are intentionally NOT compared - callers should use
 * useCallback or useMemoizedCallbacks to ensure stable references.
 */
export const AudioRecordingsList = memo(
  AudioRecordingsListComponent,
  recordingsListPropsAreEqual
);

function LoadingSkeleton({ viewMode }: { viewMode: "card" | "table" }) {
  if (viewMode === "card") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="flex justify-between pt-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="p-4 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[150px]" />
            </div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
