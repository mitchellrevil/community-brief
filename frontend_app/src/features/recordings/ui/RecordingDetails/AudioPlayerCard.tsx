import React, { memo } from 'react';
import { AlertCircle, Download, FileAudio, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { fadeInUp } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

interface AudioPlayerCardProps {
  audioUrl?: string;
  displayName: string;
  onDownload: () => void;
  onSeekToProvided?: (seekTo: ((time: number, shouldPlay?: boolean) => void) | null) => void;
  pendingSeek?: number | null;
  isMobile: boolean;
  isTinyScreen: boolean;
}

/**
 * Self-contained audio player card with full playback controls
 * Responsive design with mobile-optimized touch targets
 */
export const AudioPlayerCard = memo(function AudioPlayerCardView({
  audioUrl,
  displayName,
  onDownload,
  onSeekToProvided,
  pendingSeek,
  isMobile,
  isTinyScreen,
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

  // Provide seekTo function to parent
  React.useEffect(() => {
    onSeekToProvided?.(seekTo);

    return () => {
      onSeekToProvided?.(null);
    };
  }, [seekTo, onSeekToProvided]);



  // Apply a pending seek when passed from parent
  React.useEffect(() => {
    if (pendingSeek == null) return;
    if (Number.isFinite(pendingSeek)) {
      seekTo(pendingSeek, true).catch((err) => console.error('AudioPlayerCard: seek failed', err));
    }
  }, [pendingSeek, seekTo]);

  if (!audioUrl) {
    // Hide the player when there is no audio file URL
    return null;
  }

  return (
    <MotionDiv
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      layout
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm w-full">
      <CardHeader className="pb-3 sm:pb-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2 truncate">
          <FileAudio className={`${isTinyScreen ? 'h-4 w-4' : 'h-5 w-5'} text-primary shrink-0`} />
          <span className="truncate">{displayName}</span>
        </CardTitle>
        {!isMobile && (
          <Button onClick={onDownload} variant="ghost" size="sm" className="shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-6 p-3 sm:p-6">
        <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />

        {hasAudioError ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 sm:p-4 text-center">
            <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-destructive mx-auto mb-2" />
            <p className="text-destructive font-medium text-sm sm:text-base">Failed to load audio file</p>
            <p className="text-destructive/80 text-xs sm:text-sm mt-1">
              The audio file may be corrupted or in an unsupported format
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-muted/50 to-muted/30 rounded-xl p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
            {/* Playback Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full"> 

              <Button
                size="icon"
                className="h-10 w-10 sm:h-12 sm:w-12 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-lg transition-all duration-200 active:scale-95 sm:hover:scale-105 flex-shrink-0 self-center"
                onClick={togglePlayPause}
                disabled={isAudioLoading}
              >
                {isAudioLoading ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </Button>

              <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={1}
                  className="cursor-pointer touch-none"
                  onValueChange={handleTimeSliderChange}
                  disabled={!duration}
                />
                <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                  <span className="tabular-nums">{formattedCurrentTime}</span>
                  <span className="tabular-nums truncate max-w-[50%]">{formattedDuration}</span>
                </div>
              </div>
            </div>

            {/* Volume Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-1">
                <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0">
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Slider
                  value={[displayVolume]}
                  max={100}
                  step={1}
                  className="flex-1 cursor-pointer touch-none"
                  onValueChange={handleVolumeSliderChange}
                />
                <span className="text-xs sm:text-sm text-muted-foreground w-10 sm:w-12 text-right tabular-nums flex-shrink-0">
                  {Math.round(displayVolume)}%
                </span>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={onDownload}
                    className="hover:bg-muted w-full sm:w-auto"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>

                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </MotionDiv>
  );
});
