import { MicOff, PauseCircle, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { RecordingAudioAlert } from "../hooks/useRecordingAudioAlerts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecordingAlertBannerProps {
  alert: RecordingAudioAlert | null;
  onDismiss: () => void;
}

export function RecordingAlertBanner({
  alert,
  onDismiss,
}: RecordingAlertBannerProps) {
  if (!alert || typeof document === "undefined") return null;

  const isPausedSpeech = alert === "paused-speech";
  const Icon = isPausedSpeech ? PauseCircle : MicOff;
  const title = isPausedSpeech
    ? "Recording is paused"
    : "No microphone input detected";
  const description = isPausedSpeech
    ? "Microphone activity was detected. Resume recording to capture what is being said."
    : "Check your microphone or move closer before continuing.";

  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      data-testid="recording-audio-alert"
      className={cn(
        "fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 z-[70] flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border p-3 pr-2 shadow-lg backdrop-blur-md",
        isPausedSpeech
          ? "border-amber-300 bg-amber-50/95 text-amber-950 dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-50"
          : "border-red-300 bg-red-50/95 text-red-950 dark:border-red-800 dark:bg-red-950/95 dark:text-red-50",
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-5 opacity-80">{description}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        className="h-9 w-9 shrink-0 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss recording alert"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>,
    document.body,
  );
}
