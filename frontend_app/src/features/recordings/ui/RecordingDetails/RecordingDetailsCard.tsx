import { memo } from 'react';
import { Calendar, Clock, FileAudio, Hash, Tag } from 'lucide-react';
import type { ExtendedAudioRecording } from './hooks/useRecordingData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { fadeInUp } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

interface RecordingDetailsCardProps {
  recording: ExtendedAudioRecording;
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
  categoryDisplay,
  subcategoryDisplay,
  durationSeconds,
  isTinyScreen,
}: RecordingDetailsCardProps) {
  const formatDate = (dateValue: string | number | undefined) => {
    if (dateValue === undefined) return 'N/A';
    try {
      return new Date(dateValue).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  const formatDuration = (seconds: number | undefined) => {
    if (seconds === undefined || !Number.isFinite(seconds)) return 'N/A';
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}m ${secs}s`;
  };

  const resolvedDuration =
    typeof durationSeconds === "number"
      ? durationSeconds
      : typeof (recording as any).audio_duration_seconds === "number"
        ? (recording as any).audio_duration_seconds
        : typeof (recording as any).duration === "number"
          ? (recording as any).duration
          : undefined;

  const metadataItems = [
    {
      icon: Hash,
      label: 'Job ID',
      value: recording.id,
      copyable: true,
    },
    {
      icon: Calendar,
      label: 'Created',
      value: formatDate(recording.created_at),
    },
    {
      icon: Clock,
      label: 'Duration',
      // Prefer provided durationSeconds prop, then backend-provided audio_duration_seconds
      value: formatDuration(resolvedDuration),
    },
    {
      icon: Tag,
      label: 'Prompt',
      value: categoryDisplay,
    },
    {
      icon: Tag,
      label: 'Meeting Type',
      value: subcategoryDisplay ?? '—',
    },
    // Business Unit and Original File removed per request
  ];

  const tags = Array.isArray((recording as any).tags) ? (recording as any).tags as Array<string> : [];

  return (
    <MotionDiv
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm w-full overflow-hidden">
      <CardHeader className="pb-2 xs:pb-3">
        <CardTitle className={`${isTinyScreen ? 'text-xs' : 'text-sm xs:text-base sm:text-lg'} flex items-center gap-1.5 xs:gap-2`}>
          <FileAudio className={`${isTinyScreen ? 'h-3.5 w-3.5' : 'h-4 w-4 xs:h-5 xs:w-5'} text-primary flex-shrink-0`} />
          <span className="truncate">Recording Details</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 xs:space-y-3 px-2 xs:px-4 sm:px-6">
        {metadataItems.map((item, index) => (
          <div key={index}>
            <div className="flex items-start gap-2 xs:gap-3">
              <div className="shrink-0 rounded-md bg-muted p-1 xs:p-1.5 sm:p-2">
                <item.icon className={`${isTinyScreen ? 'h-3 w-3' : 'h-3.5 w-3.5 xs:h-4 xs:w-4'} text-muted-foreground`} />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5 xs:space-y-1">
                <p className={`${isTinyScreen ? 'text-[0.65rem]' : 'text-[0.7rem] xs:text-xs sm:text-sm'} font-medium text-muted-foreground`}>{item.label}</p>
                <p
                  className={`${isTinyScreen ? 'text-[0.7rem]' : 'text-xs xs:text-sm'} break-words overflow-hidden ${
                    item.copyable ? 'font-mono text-[0.65rem] xs:text-xs' : ''
                  }`}
                >
                  {item.value}
                </p>
              </div>
            </div>
            {index < metadataItems.length - 1 && <Separator className="mt-2 xs:mt-3" />}
          </div>
        ))}

        {tags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5 xs:space-y-2">
              <p className={`${isTinyScreen ? 'text-[0.65rem]' : 'text-[0.7rem] xs:text-xs sm:text-sm'} font-medium text-muted-foreground`}>Tags</p>
              <div className="flex flex-wrap gap-1 xs:gap-1.5 sm:gap-2">
                {tags.map((tag: string, idx: number) => (
                  <Badge key={idx} variant="secondary" className={isTinyScreen ? 'text-[0.65rem] px-1.5 py-0.5' : 'text-[0.7rem] xs:text-xs px-2'}>
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
