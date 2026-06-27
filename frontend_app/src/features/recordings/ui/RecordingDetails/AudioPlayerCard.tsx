import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionDiv } from "@/components/ui/motion";
import { Slider } from "@/components/ui/slider";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatDuration } from "@/lib/date-utils";
import { fadeInUp, TRANSITION } from "@/lib/motion";
import {
  AlertCircle,
  ChevronDown,
  Download,
  Loader2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

interface AudioPlayerCardProps {
  audioUrl?: string;
  displayName: string;
  durationSeconds?: number;
  onDownload: () => void;
  onSeekToProvided?: (
    seekTo: ((time: number, shouldPlay?: boolean) => void) | null,
  ) => void;
  pendingSeek?: number | null;
  isMobile: boolean;
}

export const AudioPlayerCard = memo(function AudioPlayerCardView({
  audioUrl,
  displayName,
  durationSeconds,
  onDownload,
  onSeekToProvided,
  pendingSeek,
  isMobile,
}: AudioPlayerCardProps) {
  const {
    audioRef,
    isPlaying,
    isMuted,
    currentTime,
    duration,
    displayVolume,
    togglePlayPause,
    toggleMute,
    handleTimeSliderChange,
    handleVolumeSliderChange,
    seekTo,
    formattedCurrentTime,
    formattedDuration,
    isLoading: isAudioLoading,
    hasError: hasAudioError,
  } = useAudioPlayer(audioUrl);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const collapsedDuration = duration
    ? formattedDuration
    : formatDuration(durationSeconds);

  React.useEffect(() => {
    onSeekToProvided?.(seekTo);

    return () => {
      onSeekToProvided?.(null);
    };
  }, [seekTo, onSeekToProvided]);

  React.useEffect(() => {
    if (pendingSeek == null) return;
    if (Number.isFinite(pendingSeek)) {
      setIsExpanded(true);
      seekTo(pendingSeek, true).catch((err) =>
        console.error("AudioPlayerCard: seek failed", err),
      );
    }
  }, [pendingSeek, seekTo]);

  if (!audioUrl) {
    return null;
  }

  const handlePrimaryPlay = () => {
    setIsExpanded(true);
    void togglePlayPause();
  };

  return (
    <MotionDiv variants={fadeInUp} initial="hidden" animate="visible" layout>
      <Card className="border-border/50 bg-card/50 w-full backdrop-blur-sm">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />

        <CardHeader className="flex-row items-center gap-3 space-y-0 p-3 sm:p-4">
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-black text-white shadow-sm hover:bg-black/90"
            onClick={handlePrimaryPlay}
            disabled={isAudioLoading || hasAudioError}
            aria-label={isPlaying ? "Pause recording" : "Play recording"}
          >
            {isAudioLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:text-base">
            <span className="truncate" title={displayName}>
              {displayName}
            </span>
          </CardTitle>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:text-sm">
            {collapsedDuration}
          </span>
          {!isMobile && (
            <Button
              onClick={onDownload}
              variant="secondary"
              size="sm"
              className="h-8 shrink-0 gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
          <Button
            onClick={() => setIsExpanded((expanded) => !expanded)}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? "Collapse audio player" : "Expand audio player"
            }
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        </CardHeader>

        <MotionDiv
          initial={false}
          animate={{
            height: isExpanded ? "auto" : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={TRANSITION.normal}
          className="overflow-hidden"
        >
          <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-4">
            {hasAudioError ? (
              <div className="bg-destructive/10 border-destructive/20 rounded-lg border p-3 text-center sm:p-4">
                <AlertCircle className="text-destructive mx-auto mb-2 h-5 w-5 sm:h-6 sm:w-6" />
                <p className="text-destructive text-sm font-medium sm:text-base">
                  Failed to load audio file
                </p>
                <p className="text-destructive/80 mt-1 text-xs sm:text-sm">
                  The audio file may be corrupted or in an unsupported format
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5 sm:space-y-2">
                  <Slider
                    value={[currentTime]}
                    max={duration || 100}
                    step={1}
                    className="cursor-pointer touch-none"
                    onValueChange={handleTimeSliderChange}
                    disabled={!duration}
                  />
                  <div className="text-muted-foreground flex justify-between text-xs sm:text-sm">
                    <span className="tabular-nums">{formattedCurrentTime}</span>
                    <span className="max-w-[50%] truncate tabular-nums">
                      {formattedDuration}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    className="h-8 w-8 flex-shrink-0 sm:h-9 sm:w-9"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Slider
                    value={[displayVolume]}
                    max={100}
                    step={1}
                    className="flex-1 cursor-pointer touch-none"
                    onValueChange={handleVolumeSliderChange}
                  />
                  <span className="text-muted-foreground w-10 flex-shrink-0 text-right text-xs tabular-nums sm:w-12 sm:text-sm">
                    {Math.round(displayVolume)}%
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </MotionDiv>
      </Card>
    </MotionDiv>
  );
});
