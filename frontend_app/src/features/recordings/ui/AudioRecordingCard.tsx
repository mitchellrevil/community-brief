import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditableDisplayName } from "@/components/ui/editable-display-name";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Calendar,
  Download,
  Eye,
  FileAudio,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Share2,
  Trash2,
} from "lucide-react";

export interface AudioRecordingCardProps {
  recording: {
    id: string;
    displayname?: string;
    display_name?: string;
    file_name?: string;
    filename?: string;
    file_path: string;
    status:
      | "completed"
      | "processing"
      | "uploaded"
      | "transcribing"
      | "transcribed"
      | "analysing"
      | "failed"
      | "error";
    created_at: number;
    user_id?: string;
    _isQueued?: boolean;
  };
  onViewDetails: () => void;
  onPlay?: () => void;
  onDownload?: () => void;
  onRetryProcessing?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  className?: string;
}

const AudioRecordingCardComponent = ({
  recording,
  onViewDetails,
  onPlay,
  onDownload,
  onRetryProcessing,
  onShare,
  onDelete,
  className,
}: AudioRecordingCardProps) => {
  const formattedDate = formatDate(recording.created_at);

  return (
    <Card
      className={cn(
        "group border-border/60 bg-card hover:border-primary/20 flex h-full flex-col transition-all duration-200 hover:shadow-md",
        className,
      )}
    >
      <CardHeader className="space-y-3 p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-primary/10 text-primary flex-shrink-0 rounded-lg p-2.5">
              <FileAudio className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <EditableDisplayName
                job={recording}
                className="block truncate text-base leading-snug font-semibold"
              />
              <div className="text-muted-foreground mt-1 truncate text-xs">
                {recording.file_name || recording.filename}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground -mr-2 h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={onViewDetails}
                disabled={recording._isQueued}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {onPlay && (
                <DropdownMenuItem
                  onClick={onPlay}
                  disabled={recording._isQueued}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Play Audio
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem
                  onClick={onDownload}
                  disabled={recording._isQueued}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem
                  onClick={onShare}
                  disabled={recording._isQueued}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
              )}
              {recording.status === "uploaded" &&
                onRetryProcessing &&
                !recording._isQueued && (
                  <DropdownMenuItem onClick={onRetryProcessing}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Retry Processing
                  </DropdownMenuItem>
                )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-5 pt-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <StatusBadge
              status={recording.status}
              size="sm"
              showIcon={true}
              animate={
                recording.status === "processing" ||
                recording.status === "analysing" ||
                recording.status === "transcribing"
              }
            />
            {recording._isQueued && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                Queued
              </span>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2 p-5 pt-2">
        <Link
          to="/audio-recordings/$id"
          params={{ id: recording.id }}
          search={{ from: "files" }}
          className="flex-1"
          disabled={recording._isQueued}
        >
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={recording._isQueued}
          >
            View Details
          </Button>
        </Link>
        {onPlay && (
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onPlay}
            disabled={recording._isQueued}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export const AudioRecordingCard = memo(
  AudioRecordingCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.recording.id === nextProps.recording.id &&
      prevProps.recording.status === nextProps.recording.status &&
      prevProps.recording.displayname === nextProps.recording.displayname &&
      prevProps.recording.display_name === nextProps.recording.display_name &&
      prevProps.recording.file_name === nextProps.recording.file_name &&
      prevProps.recording.created_at === nextProps.recording.created_at &&
      prevProps.className === nextProps.className
    );
  },
);
