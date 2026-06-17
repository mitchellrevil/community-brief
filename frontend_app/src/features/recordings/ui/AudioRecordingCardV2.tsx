import { memo } from "react";
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
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/date-utils";
import { EditableDisplayName } from "@/components/ui/editable-display-name";

export interface AudioRecordingCardV2Props {
  recording: {
    id: string;
    displayname?: string;
    display_name?: string;
    file_name?: string;
    filename?: string;
    file_path: string;
    status: "completed" | "processing" | "uploaded" | "transcribing" | "transcribed" | "analysing" | "failed" | "error";
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

const AudioRecordingCardV2Component = ({
  recording,
  onViewDetails,
  onPlay,
  onDownload,
  onRetryProcessing,
  onShare,
  onDelete,
  className,
}: AudioRecordingCardV2Props) => {
  const formattedDate = formatDate(recording.created_at);
  

  return (
    <Card
      className={cn(
        "group flex flex-col h-full transition-all duration-200 hover:shadow-md border-border/60 bg-card hover:border-primary/20",
        className
      )}
    >
      <CardHeader className="p-5 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <FileAudio className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <EditableDisplayName
                job={recording}
                className="font-semibold text-base leading-snug truncate block"
              />
              <div className="text-xs text-muted-foreground truncate mt-1">
                {recording.file_name || recording.filename}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={onViewDetails} disabled={recording._isQueued}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {onPlay && (
                <DropdownMenuItem onClick={onPlay} disabled={recording._isQueued}>
                  <Play className="mr-2 h-4 w-4" />
                  Play Audio
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem onClick={onDownload} disabled={recording._isQueued}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem onClick={onShare} disabled={recording._isQueued}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
              )}
              {recording.status === "uploaded" && onRetryProcessing && !recording._isQueued && (
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
      <CardContent className="p-5 pt-0 flex-1">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <StatusBadge
              status={recording.status}
              size="sm"
              showIcon={true}
              animate={recording.status === "processing" || recording.status === "analysing" || recording.status === "transcribing"}
            />
            {recording._isQueued && (
              <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-300">
                Queued
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-5 pt-2 flex gap-2">
        <Link
          to="/audio-recordings/$id"
          params={{ id: recording.id }}
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

export const AudioRecordingCardV2 = memo(
  AudioRecordingCardV2Component,
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
  }
);
