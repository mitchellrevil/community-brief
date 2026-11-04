import { memo } from "react";
import { Calendar, Clock, FileAudio, Hash, Tag } from "lucide-react";
import type { RecordingSummary } from "../../data/file-entry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionDiv } from "@/components/ui/motion";
import { Separator } from "@/components/ui/separator";
import { fadeInUp } from "@/lib/motion";


interface RecordingDetailsCardProps {
  recording: RecordingSummary & { duration?: number; tags?: Array<string> };
  idLabel?: string;
  categoryDisplay: string;
  subcategoryDisplay?: string | null;
  durationSeconds?: number | undefined;
  isTinyScreen: boolean;
}

/**
 * Recording metadata sidebar card
 * Displays all recording details in a clean, organized format
 */
export const RecordingDetailsCard = memo(function RecordingDetailsCardView({
  recording,
  idLabel = "Job ID",
  categoryDisplay,
  subcategoryDisplay,
  durationSeconds,
  isTinyScreen,
}: RecordingDetailsCardProps) {
  const formatDate = (dateValue: string | number | null | undefined) => {
    if (dateValue == null) return "N/A";
    try {
      return new Date(dateValue).toLocaleString();
    } catch {
      return "Invalid date";
    }
  };

  const formatDuration = (seconds: number | undefined) => {
    if (seconds === undefined || !Number.isFinite(seconds)) return "N/A";
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}m ${secs}s`;
  };

  const resolvedDuration =
    typeof durationSeconds === "number"
      ? durationSeconds
      : typeof recording.audio_duration_seconds === "number"
        ? recording.audio_duration_seconds
        : typeof recording.duration === "number"
          ? recording.duration
          : undefined;

  const metadataItems = [
    {
      icon: Hash,
      label: idLabel,
      value: recording.id,
      copyable: true,
    },
    {
      icon: Calendar,
      label: "Created",
      value: formatDate(recording.created_at),
    },
    {
      icon: Clock,
      label: "Duration",
      // Prefer provided durationSeconds prop, then backend-provided audio_duration_seconds
      value: formatDuration(resolvedDuration),
    },
    {
      icon: Tag,
      label: "Prompt",
      value: categoryDisplay,
    },
    {
      icon: Tag,
      label: "Meeting Type",
      value: subcategoryDisplay ?? "—",
    },
    // Business Unit and Original File removed per request
  ];

  const tags = recording.tags ?? [];

  return (
    <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
      <Card className="border-border/50 bg-card/50 w-full overflow-hidden backdrop-blur-sm">
        <CardHeader className="xs:pb-3 pb-2">
          <CardTitle
            className={`${isTinyScreen ? "text-xs" : "xs:text-base text-sm sm:text-lg"} xs:gap-2 flex items-center gap-1.5`}
          >
            <FileAudio
              className={`${isTinyScreen ? "h-3.5 w-3.5" : "xs:h-5 xs:w-5 h-4 w-4"} text-primary flex-shrink-0`}
            />
            <span className="truncate">Recording Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="xs:space-y-3 xs:px-4 space-y-2 px-2 sm:px-6">
          {metadataItems.map((item, index) => (
            <div key={index}>
              <div className="xs:gap-3 flex items-start gap-2">
                <div className="bg-muted xs:p-1.5 shrink-0 rounded-md p-1 sm:p-2">
                  <item.icon
                    className={`${isTinyScreen ? "h-3 w-3" : "xs:h-4 xs:w-4 h-3.5 w-3.5"} text-muted-foreground`}
                  />
                </div>
                <div className="xs:space-y-1 min-w-0 flex-1 space-y-0.5">
                  <p
                    className={`${isTinyScreen ? "text-[0.65rem]" : "xs:text-xs text-[0.7rem] sm:text-sm"} text-muted-foreground font-medium`}
                  >
                    {item.label}
                  </p>
                  <p
                    className={`${isTinyScreen ? "text-[0.7rem]" : "xs:text-sm text-xs"} overflow-hidden break-words ${
                      item.copyable ? "xs:text-xs font-mono text-[0.65rem]" : ""
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              </div>
              {index < metadataItems.length - 1 && (
                <Separator className="xs:mt-3 mt-2" />
              )}
            </div>
          ))}

          {tags.length > 0 && (
            <>
              <Separator />
              <div className="xs:space-y-2 space-y-1.5">
                <p
                  className={`${isTinyScreen ? "text-[0.65rem]" : "xs:text-xs text-[0.7rem] sm:text-sm"} text-muted-foreground font-medium`}
                >
                  Tags
                </p>
                <div className="xs:gap-1.5 flex flex-wrap gap-1 sm:gap-2">
                  {tags.map((tag: string, idx: number) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className={
                        isTinyScreen
                          ? "px-1.5 py-0.5 text-[0.65rem]"
                          : "xs:text-xs px-2 text-[0.7rem]"
                      }
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </MotionDiv>
  );
});
