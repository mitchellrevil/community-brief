import {
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import { createPortal } from "react-dom";

import { isDevelopmentBannerEnabled } from "@/components/development-server-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  hasAudio: boolean;
  isUploading: boolean;
  isConverting: boolean;
  isPreparing?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onContinue: () => void;
  onUpload: () => void;
}

export function RecordingControls(props: RecordingControlsProps) {
  const mobileControls = (
    <div
      data-testid="mobile-recording-dock"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 px-3 pb-[env(safe-area-inset-bottom)] lg:hidden",
        isDevelopmentBannerEnabled
          ? "bottom-24 md:bottom-12"
          : "bottom-16 md:bottom-4",
      )}
    >
      <div className="border-border/70 bg-background/95 pointer-events-auto mx-auto w-full max-w-2xl border-t p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-md sm:rounded-2xl sm:border">
        <MobileControls {...props} />
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden items-center gap-3 lg:flex">
        <DesktopControls {...props} />
      </div>
      {typeof document === "undefined"
        ? null
        : createPortal(mobileControls, document.body)}
    </>
  );
}

function DesktopControls({
  isRecording,
  isPaused,
  hasAudio,
  isUploading,
  isConverting,
  isPreparing,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  onContinue,
  onUpload,
}: RecordingControlsProps) {
  if (!isRecording && !hasAudio) {
    return (
      <Button
        data-tutorial="record-button"
        onClick={onStart}
        disabled={isPreparing || isConverting}
        size="lg"
        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full bg-red-600 shadow-md ring-2 ring-red-100 transition-all hover:bg-red-700"
        aria-label="Start recording"
      >
        {isPreparing ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <Mic className="h-7 w-7" />
        )}
        <span className="text-xs font-bold tracking-widest">
          {isPreparing ? "WAIT" : "RECORD"}
        </span>
      </Button>
    );
  }

  if (isRecording) {
    return (
      <>
        <Button
          onClick={isPaused ? onResume : onPause}
          variant="outline"
          size="lg"
          className="h-12 gap-2 rounded-full bg-orange-500 px-6 text-white hover:bg-orange-600 hover:text-white"
        >
          {isPaused ? (
            <>
              <Play className="h-5 w-5" />
              <span className="font-semibold">Resume</span>
            </>
          ) : (
            <>
              <Pause className="h-5 w-5" />
              <span className="font-semibold">Pause</span>
            </>
          )}
        </Button>
        <Button
          onClick={onStop}
          size="lg"
          className="flex h-28 w-28 flex-col gap-1 rounded-full bg-red-600 shadow-lg ring-4 ring-red-100 transition-all hover:bg-red-700"
          aria-label="Stop recording"
        >
          <Square className="h-7 w-7 fill-current" />
          <span className="text-sm font-bold tracking-widest">STOP</span>
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        onClick={onContinue}
        disabled={isPreparing || isConverting}
        variant="outline"
        className="h-10 rounded-full px-4"
      >
        {isPreparing || isConverting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Mic className="mr-2 h-4 w-4" />
        )}
        {isConverting
          ? "Joining..."
          : isPreparing
            ? "Preparing..."
            : "Continue Recording"}
      </Button>
      <Button
        onClick={onReset}
        disabled={isConverting}
        variant="ghost"
        className="text-muted-foreground h-10 rounded-full px-4"
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Redo
      </Button>
      <Button
        onClick={onUpload}
        disabled={isUploading || isConverting}
        className="h-10 rounded-full bg-green-600 px-5 text-white shadow-sm hover:bg-green-700"
      >
        <UploadState
          isUploading={isUploading}
          isConverting={isConverting}
          longLabel
        />
      </Button>
    </div>
  );
}

function MobileControls(props: RecordingControlsProps) {
  const {
    isRecording,
    isPaused,
    hasAudio,
    isUploading,
    isConverting,
    isPreparing,
    onStart,
    onPause,
    onResume,
    onStop,
    onReset,
    onContinue,
    onUpload,
  } = props;

  if (isRecording) {
    return (
      <div className="grid w-full grid-cols-2 gap-2.5">
        <Button
          onClick={isPaused ? onResume : onPause}
          variant="outline"
          className="h-14 gap-2 rounded-xl border-orange-200 bg-orange-50 px-4 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? (
            <>
              <Play className="h-5 w-5" />
              <span className="text-sm font-semibold">Resume</span>
            </>
          ) : (
            <>
              <Pause className="h-5 w-5" />
              <span className="text-sm font-semibold">Pause</span>
            </>
          )}
        </Button>
        <Button
          onClick={onStop}
          className="h-14 gap-2 rounded-xl bg-red-600 px-4 text-white shadow-sm hover:bg-red-700"
          aria-label="Stop recording"
        >
          <Square className="h-4 w-4 fill-current" />
          <span className="font-semibold">Stop</span>
        </Button>
      </div>
    );
  }

  if (hasAudio) {
    return (
      <div className="grid w-full grid-cols-2 gap-2.5">
        <Button
          onClick={onContinue}
          disabled={isPreparing || isConverting}
          variant="outline"
          className="h-12 rounded-xl px-3"
          aria-label="Continue recording"
        >
          {isPreparing || isConverting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mic className="mr-2 h-4 w-4" />
          )}
          {isConverting
            ? "Joining..."
            : isPreparing
              ? "Preparing..."
              : "Continue"}
        </Button>
        <Button
          onClick={onReset}
          disabled={isConverting}
          variant="outline"
          className="text-muted-foreground h-12 rounded-xl px-3"
          aria-label="Redo recording"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Redo
        </Button>
        <Button
          onClick={onUpload}
          disabled={isUploading || isConverting}
          className="col-span-2 h-14 rounded-xl bg-green-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-green-700"
          aria-label="Submit recording"
        >
          <UploadState isUploading={isUploading} isConverting={isConverting} />
        </Button>
      </div>
    );
  }

  return (
    <Button
      data-tutorial="record-button"
      onClick={onStart}
      disabled={isPreparing || isConverting}
      className="h-14 w-full gap-3 rounded-xl bg-red-600 text-base font-semibold text-white shadow-sm hover:bg-red-700"
      aria-label="Start recording"
    >
      {isPreparing ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Mic className="h-5 w-5" />
      )}
      <span>{isPreparing ? "Preparing..." : "Start recording"}</span>
    </Button>
  );
}

function UploadState({
  isUploading,
  isConverting,
  longLabel = false,
}: {
  isUploading: boolean;
  isConverting: boolean;
  longLabel?: boolean;
}) {
  if (isUploading || isConverting) {
    return (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {isConverting
          ? longLabel
            ? "Converting..."
            : "Converting"
          : longLabel
            ? "Uploading..."
            : "Uploading"}
      </>
    );
  }

  return (
    <>
      <Upload className="mr-2 h-4 w-4" />
      Submit
    </>
  );
}
