import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditableDisplayName } from "@/components/ui/editable-display-name";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recordingsListPropsAreEqual } from "@/hooks/useMemoizedCallbacks";
import { formatDate } from "@/lib/date-utils";
import { listItemFadeInUp } from "@/lib/motion";
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

import { AudioRecordingCard } from "./AudioRecordingCard";

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
      <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <FileAudio className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold">No recordings found</h3>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          Try adjusting your filters or upload a new recording to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4" data-tutorial={dataTutorial}>
      {/* Card View - Always on mobile, optional on desktop */}
      {viewMode === "card" || window.innerWidth < 640 ? (
        <MotionList
          as="div"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {recordings.map((recording) => (
            <MotionListItem key={recording.id} as="div">
              <AudioRecordingCard
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
        <div className="bg-card w-full rounded-lg border shadow-sm">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem] sm:min-w-[14rem]">
                    Name
                  </TableHead>
                  <TableHead className="min-w-[7.5rem]">Status</TableHead>
                  <TableHead className="min-w-[8.5rem]">Date</TableHead>
                  <TableHead className="w-16 text-right sm:w-20">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-primary/10 text-primary flex-shrink-0 rounded-lg p-2">
                          <FileAudio className="h-4 w-4" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <EditableDisplayName
                            job={row}
                            className="truncate font-medium"
                            showEditIcon={false}
                          />
                          <span className="text-muted-foreground truncate text-xs">
                            {row.file_name || row.filename}
                          </span>
                        </div>
                        {row._isQueued && (
                          <span className="flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
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
                        animate={
                          row.status === "processing" ||
                          row.status === "analysing" ||
                          row.status === "transcribing"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-[min(90vw,18rem)]"
                        >
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
                            <DropdownMenuItem
                              onClick={() => onRetryProcessing(row)}
                            >
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
  recordingsListPropsAreEqual,
);

function LoadingSkeleton({ viewMode }: { viewMode: "card" | "table" }) {
  if (viewMode === "card") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
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
    <div className="bg-card rounded-md border">
      <div className="space-y-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="flex-1 space-y-2">
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
