import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Share2,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { formatDateTime, formatDuration, parseDate } from "@/lib/date-utils";
import { getDisplayName } from "@/lib/display-name-utils";
import { cn } from "@/lib/utils";

export type RecordingCardLayout = "card" | "list";
export type RecordingDetailsSource = "files" | "shared" | "all-files";

type RecordingStatus =
  | "completed"
  | "processing"
  | "uploaded"
  | "pending"
  | "transcribing"
  | "transcribed"
  | "analysing"
  | "failed"
  | "error"
  | "queued"
  | "default";

type RecordingTimestamp = string | number | null | undefined;

export interface AudioRecordingCardProps {
  recording: {
    id: string;
    displayname?: string;
    display_name?: string;
    file_name?: string;
    filename?: string;
    file_path?: string;
    status?: RecordingStatus | string;
    created_at?: RecordingTimestamp;
    updated_at?: RecordingTimestamp;
    audio_duration_seconds?: number | null;
    user_id?: string;
    user_email?: string;
    _ts?: number;
    ttl?: number | null;
    _isQueued?: boolean;
  };
  layout?: RecordingCardLayout;
  isEditable?: boolean;
  ownerLabel?: string;
  accessLabel?: string;
  sharingLabel?: string;
  message?: string;
  detailsFrom?: RecordingDetailsSource;
  onViewDetails?: () => void;
  onPlay?: () => void;
  onDownload?: () => void;
  onRetryProcessing?: () => void;
  retryAvailable?: boolean;
  retryPending?: boolean;
  onShare?: () => void;
  onDelete?: () => void;
  className?: string;
  primaryAction?: ReactNode;
  statusLabel?: string;
  durationDescription?: string;
  metadataItems?: Array<{ label: string; value: string }>;
}

const AudioRecordingCardComponent = ({
  recording,
  layout = "card",
  isEditable = true,
  ownerLabel,
  accessLabel,
  sharingLabel,
  message,
  detailsFrom,
  onViewDetails,
  onPlay,
  onDownload,
  onRetryProcessing,
  retryAvailable,
  retryPending = false,
  onShare,
  onDelete,
  className,
  primaryAction,
  statusLabel,
  durationDescription = "Recording length",
  metadataItems,
}: AudioRecordingCardProps) => {
  const displayName = getDisplayName(recording);
  const sourceName = recording.file_name || recording.filename;
  const duration =
    typeof recording.audio_duration_seconds === "number" &&
    Number.isFinite(recording.audio_duration_seconds)
      ? formatDuration(recording.audio_duration_seconds)
      : null;
  const createdDate = parseDate(recording.created_at);
  const updatedDate = parseDate(recording.updated_at);
  const expiry = getExpiry(recording._ts, recording.ttl);
  const shouldShowUpdated = Boolean(
    updatedDate &&
    (!createdDate || updatedDate.getTime() >= createdDate.getTime()),
  );
  const status = normalizeStatus(recording.status);
  const isQueued = recording._isQueued || status === "queued";
  const canRetry =
    Boolean(onRetryProcessing) &&
    !isQueued &&
    (retryAvailable ?? status === "uploaded");
  const hasSecondaryActions = Boolean(
    onPlay || onDownload || onShare || canRetry || onDelete,
  );

  const durationLabel = duration ? (
    <span
      className="text-foreground shrink-0 font-mono text-xs font-semibold whitespace-nowrap tabular-nums"
      aria-label={`${durationDescription} ${duration}`}
      title={`${durationDescription}: ${duration}`}
    >
      {duration}
    </span>
  ) : null;

  const statusBadge = (
    <StatusBadge
      status={status}
      size="sm"
      showIcon={status === "transcribing"}
      variant="subtle"
      className="shrink-0"
      animate={
        status === "processing" ||
        status === "analysing" ||
        status === "transcribing"
      }
    >
      {statusLabel}
    </StatusBadge>
  );

  const hasContext = Boolean(
    accessLabel || ownerLabel || sharingLabel || retryPending,
  );

  const context = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {accessLabel && (
        <span className="text-muted-foreground text-xs font-medium">
          {accessLabel}
        </span>
      )}
      {ownerLabel && <ContextLabel label={ownerLabel} />}
      {sharingLabel && <ContextLabel label={sharingLabel} />}
      {retryPending && (
        <span className="text-muted-foreground text-xs">Retrying...</span>
      )}
    </div>
  );

  const identity = (
    <div className="flex min-w-0 flex-1 flex-nowrap items-baseline gap-2">
      {layout === "list" && durationLabel}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {isEditable ? (
            <EditableDisplayName
              job={recording}
              className="min-w-0 flex-1 text-sm leading-snug font-semibold"
            />
          ) : (
            <h3
              className="text-foreground min-w-0 flex-1 truncate text-sm leading-snug font-semibold"
              title={displayName}
            >
              {displayName}
            </h3>
          )}
          {layout === "card" && durationLabel}
          {layout === "card" && statusBadge}
        </div>
        <div className={cn("mt-0.5 min-w-0", layout === "card" && "h-4")}>
          {sourceName && sourceName !== displayName ? (
            <div className="flex min-w-0 items-center gap-2">
              <p
                className="text-muted-foreground mt-0.5 min-w-0 flex-1 truncate text-xs"
                title={sourceName}
              >
                {sourceName}
              </p>
              {expiry && <ExpiryMetadata {...expiry} />}
            </div>
          ) : (
            expiry && <ExpiryMetadata {...expiry} />
          )}
        </div>
      </div>
    </div>
  );

  const statusAndContext = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {statusBadge}
      {context}
    </div>
  );

  const metadata = (
    <dl className="flex flex-col items-start gap-1">
      <MetadataItem
        label="Created"
        value={
          createdDate
            ? formatDateTime(recording.created_at)
            : "Date unavailable"
        }
        date={createdDate}
      />
      {shouldShowUpdated && updatedDate && (
        <MetadataItem
          label="Updated"
          value={formatDateTime(recording.updated_at)}
          date={updatedDate}
        />
      )}
      {metadataItems?.map((item) => (
        <MetadataItem
          key={item.label}
          label={item.label}
          value={item.value}
          date={null}
        />
      ))}
    </dl>
  );

  const detailsAction = primaryAction ?? (
    <DetailsAction
      recordingId={recording.id}
      displayName={displayName}
      detailsFrom={detailsFrom}
      onViewDetails={onViewDetails}
      disabled={isQueued}
      layout={layout}
    />
  );

  const secondaryActions = hasSecondaryActions ? (
    <RecordingActions
      disabled={isQueued}
      onPlay={onPlay}
      onDownload={onDownload}
      onShare={onShare}
      onRetryProcessing={canRetry ? onRetryProcessing : undefined}
      retryPending={retryPending}
      onDelete={onDelete}
    />
  ) : null;

  if (layout === "list") {
    return (
      <div
        className={cn(
          "group border-border/70 bg-card hover:border-primary/30 hover:bg-muted/20 flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 transition-colors sm:gap-3",
          className,
        )}
      >
        {identity}
        <div className="hidden min-w-[13rem] flex-1 items-center gap-4 md:flex">
          {statusAndContext}
        </div>
        <div className="hidden min-w-[15rem] shrink-0 lg:block">{metadata}</div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {detailsAction}
          {secondaryActions}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "group border-border/70 bg-card hover:border-primary/30 flex h-full flex-col overflow-hidden transition-colors duration-200",
        className,
      )}
    >
      <CardHeader className="space-y-2 p-3 pb-2">
        {identity}
        {hasContext && context}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 px-3 pt-0 pb-2">
        <div className="border-border/60 border-t pt-3">{metadata}</div>
        {message && (
          <p className="bg-muted/40 text-muted-foreground line-clamp-2 rounded-md px-2 py-1.5 text-xs italic">
            “{message}”
          </p>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-2 px-3 pt-0 pb-3">
        {detailsAction}
        {secondaryActions}
      </CardFooter>
    </Card>
  );
};

function normalizeStatus(status: string | undefined): RecordingStatus {
  const knownStatuses: Array<RecordingStatus> = [
    "completed",
    "processing",
    "uploaded",
    "pending",
    "transcribing",
    "transcribed",
    "analysing",
    "failed",
    "error",
    "queued",
    "default",
  ];

  const normalizedStatus = status?.toLowerCase() as RecordingStatus | undefined;
  return normalizedStatus && knownStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : "default";
}

function ContextLabel({ label }: { label: string }) {
  return (
    <span
      className="text-muted-foreground max-w-full truncate text-xs"
      title={label}
    >
      {label}
    </span>
  );
}

function MetadataItem({
  label,
  value,
  date,
}: {
  label: string;
  value: string;
  date: Date | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-1 text-xs">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd
        className="text-foreground font-normal whitespace-nowrap"
        title={value}
      >
        {date ? <time dateTime={date.toISOString()}>{value}</time> : value}
      </dd>
    </div>
  );
}

function getExpiry(
  updatedAtSeconds: number | undefined,
  ttlSeconds: number | null | undefined,
) {
  if (
    !Number.isFinite(updatedAtSeconds) ||
    !Number.isFinite(ttlSeconds) ||
    (ttlSeconds ?? 0) <= 0
  ) {
    return null;
  }

  const expiresAt =
    ((updatedAtSeconds as number) + (ttlSeconds as number)) * 1000;
  const remainingMs = expiresAt - Date.now();
  const warningWindowMs = 15 * 86_400_000;

  if (remainingMs >= warningWindowMs) {
    return null;
  }

  const days = Math.max(0, Math.ceil(remainingMs / 86_400_000));
  const daysLabel = `${days} ${days === 1 ? "day" : "days"}`;
  const expiryDate = formatDateTime(expiresAt);
  const hoverText =
    days === 0
      ? `This recording has reached its expiry time (${expiryDate}).`
      : `This recording expires in ${daysLabel} (${expiryDate}).`;

  return { daysLabel, expiresAt, hoverText };
}

function ExpiryMetadata({
  daysLabel,
  expiresAt,
  hoverText,
}: {
  daysLabel: string;
  expiresAt: number;
  hoverText: string;
}) {
  return (
    <div
      className="grid min-w-0 shrink-0 grid-cols-[max-content_minmax(0,1fr)] items-center gap-1 text-xs text-orange-700 dark:text-orange-400"
      title={hoverText}
      aria-label={hoverText}
    >
      <dt className="flex items-center gap-1">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Expires:
      </dt>
      <dd className="font-medium whitespace-nowrap">
        <time dateTime={new Date(expiresAt).toISOString()}>{daysLabel}</time>
      </dd>
    </div>
  );
}

function DetailsAction({
  recordingId,
  displayName,
  detailsFrom,
  onViewDetails,
  disabled,
  layout,
}: {
  recordingId: string;
  displayName: string;
  detailsFrom?: RecordingDetailsSource;
  onViewDetails?: () => void;
  disabled: boolean;
  layout: RecordingCardLayout;
}) {
  const button = (
    <Button
      variant={layout === "card" ? "outline" : "ghost"}
      size={layout === "card" ? "sm" : "icon"}
      className={cn(
        layout === "card" ? "h-8 min-w-0 flex-1 !shrink" : "h-8 w-8",
        "gap-2",
      )}
      onClick={onViewDetails}
      disabled={disabled}
      aria-label={layout === "list" ? `Open ${displayName}` : undefined}
    >
      {layout === "list" && <Eye className="h-4 w-4" aria-hidden="true" />}
      {layout === "card" && "Open"}
    </Button>
  );

  if (disabled) return button;

  return detailsFrom ? (
    <Link
      to="/audio-recordings/$id"
      params={{ id: recordingId }}
      search={{ from: detailsFrom }}
      className={layout === "card" ? "min-w-0 flex-1" : undefined}
    >
      {button}
    </Link>
  ) : (
    button
  );
}

function RecordingActions({
  disabled,
  onPlay,
  onDownload,
  onShare,
  onRetryProcessing,
  retryPending,
  onDelete,
}: {
  disabled: boolean;
  onPlay?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onRetryProcessing?: () => void;
  retryPending: boolean;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-8 w-8 shrink-0"
          aria-label="Open actions"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {onPlay && (
          <DropdownMenuItem onClick={onPlay} disabled={disabled}>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Play audio
          </DropdownMenuItem>
        )}
        {onDownload && (
          <DropdownMenuItem onClick={onDownload} disabled={disabled}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download
          </DropdownMenuItem>
        )}
        {onShare && (
          <DropdownMenuItem onClick={onShare} disabled={disabled}>
            <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Share
          </DropdownMenuItem>
        )}
        {onRetryProcessing && (
          <DropdownMenuItem onClick={onRetryProcessing} disabled={retryPending}>
            {retryPending ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {retryPending ? "Retrying..." : "Retry processing"}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
      prevProps.recording.updated_at === nextProps.recording.updated_at &&
      prevProps.recording.audio_duration_seconds ===
        nextProps.recording.audio_duration_seconds &&
      prevProps.recording._ts === nextProps.recording._ts &&
      prevProps.recording.ttl === nextProps.recording.ttl &&
      prevProps.layout === nextProps.layout &&
      prevProps.ownerLabel === nextProps.ownerLabel &&
      prevProps.accessLabel === nextProps.accessLabel &&
      prevProps.sharingLabel === nextProps.sharingLabel &&
      prevProps.message === nextProps.message &&
      prevProps.retryPending === nextProps.retryPending &&
      prevProps.className === nextProps.className &&
      prevProps.isEditable === nextProps.isEditable &&
      prevProps.primaryAction === nextProps.primaryAction &&
      prevProps.statusLabel === nextProps.statusLabel &&
      prevProps.durationDescription === nextProps.durationDescription &&
      prevProps.metadataItems === nextProps.metadataItems
    );
  },
);
