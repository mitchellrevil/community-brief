import type { AudioMetrics } from "@/hooks/useAudioAnalyzer";
import { MinimalAudioIndicator } from "@/components/audio-player/MinimalAudioIndicator";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";

interface RecordingLevelIndicatorProps {
  stream: MediaStream;
  metrics?: AudioMetrics;
  className?: string;
}

export function RecordingLevelIndicator({
  stream,
  metrics,
  className,
}: RecordingLevelIndicatorProps) {
  const analyzedMetrics = useAudioAnalyzer(metrics ? null : stream);

  return (
    <MinimalAudioIndicator
      metrics={metrics ?? analyzedMetrics}
      className={className}
    />
  );
}
