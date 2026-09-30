/**
 * Upload Progress Modal
 * 
 * Displays real file upload progress in a modern modal popup.
 * Only shown when online - hidden during offline queueing.
 * 
 * Features:
 * - Real upload progress tracking
 * - Live upload speed calculation
 * - Shows current/total uploaded amount
 * - Modern popup modal design with time stats
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Music, Plus, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "@/components/ui/motion";
import { AnimatePresence, fadeInUp } from "@/lib/motion";

interface UploadProgressProps {
  /** Whether the upload is currently active */
  isActive: boolean;
  /** Current upload progress data */
  progress?: {
    loaded: number;
    total: number;
    percentage: number;
  };
  /** Callback when upload completes */
  onComplete?: () => void;
  /** Whether to show the component (e.g., hide when offline) */
  show?: boolean;
  /** Filename being uploaded */
  fileName?: string;
  /** Callback to reset the form for another upload */
  onSubmitAnother?: () => void;
  /** Callback to dismiss a terminal upload message */
  onClose?: () => void;
  /** Whether upload completed successfully */
  isComplete?: boolean;
  /** Upload failure message */
  errorMessage?: string | null;
  /** Whether file is being converted before upload */
  isConverting?: boolean;
  /** Conversion progress (0-100) */
  conversionProgress?: number;
  /** Whether the backend is creating the job after the file transfer completed */
  isFinalizing?: boolean;
  /** Whether the upload was cancelled by the user */
  isCancelled?: boolean;
  /** Whether cancellation is currently safe to offer */
  canCancel?: boolean;
  /** Aborts the active file transfer */
  onCancel?: () => void;
}

export function UploadProgressSimulator({
  isActive,
  progress,
  onComplete,
  show = true,
  fileName = "File",
  onSubmitAnother,
  onClose,
  isComplete = false,
  errorMessage,
  isConverting = false,
  conversionProgress = 0,
  isFinalizing = false,
  isCancelled = false,
  canCancel = false,
  onCancel,
}: UploadProgressProps) {
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [startTime, setStartTime] = useState(Date.now());
  const [wasActiveLastRender, setWasActiveLastRender] = useState(isActive);
  const previousIsActive = useRef(isActive);

  useEffect(() => {
    if (!previousIsActive.current && isActive) {
      setStartTime(Date.now());
      setUploadSpeed(0);
    }
    previousIsActive.current = isActive;
  }, [isActive]);

  useEffect(() => {
    // If simply converting, we are not "complete" yet.
    if (isConverting) return;

    // Track when upload finishes (isActive goes from true to false)
    const progressPercentage = progress?.percentage;
    if (wasActiveLastRender && !isActive && typeof progressPercentage === "number" && progressPercentage >= 99) {
      // Upload mutation completed successfully (got 201 response)
      setTimeout(() => {
        onComplete?.();
      }, 1500);
    }
    setWasActiveLastRender(isActive);

    if (!isActive || !show || !progress) {
      return;
    }

    // Calculate upload speed based on progress
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - startTime) / 1000;
    
    if (elapsedSeconds > 0 && progress.loaded > 0) {
      const speedBytesPerSec = progress.loaded / elapsedSeconds;
      const speedMBPerSec = speedBytesPerSec / (1024 * 1024);
      setUploadSpeed(Math.max(0, speedMBPerSec));
    }
  }, [progress?.percentage, isActive, show, onComplete, startTime, wasActiveLastRender, isConverting, progress]);

  // Don't render if not shown
  if (!show) {
    return null;
  }

  const uploadedMB = progress ? progress.loaded / (1024 * 1024) : 0;
  const totalMB = progress ? progress.total / (1024 * 1024) : 0;
  
  // Logic to determine percentage: converting or uploading
  const percentage = isConverting 
    ? conversionProgress 
    : (progress?.percentage ?? 0);
  const hasError = Boolean(errorMessage);
  const isTerminal = hasError || isComplete || isCancelled;
  const isPreparing = isActive && !isConverting && !progress && !isTerminal && !isFinalizing;

  const currentTime = Date.now();
  const elapsedSeconds = (currentTime - startTime) / 1000;
  const formatTime = (seconds: number) => {
    if (seconds < 1) return "< 1s";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const remainingSeconds =
    uploadSpeed > 0 ? (totalMB - uploadedMB) / uploadSpeed : 0;

  return (
    <AnimatePresence>
      <Dialog open={show} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <MotionDiv
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <DialogHeader className="space-y-2">
                <div className="flex items-center gap-2">
                  {hasError || isCancelled ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : isComplete ? (
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : isConverting ? (
                    <Music className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  ) : (
                    <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                  )}
                  <DialogTitle>
                    {isCancelled
                      ? "Upload Cancelled"
                      : hasError
                      ? "Upload Failed"
                      : isComplete
                        ? "Upload Complete"
                        : isConverting
                          ? "Converting Audio..."
                          : isFinalizing
                            ? "Finalising Upload..."
                            : isPreparing
                            ? "Preparing Upload..."
                            : "Uploading..."}
                  </DialogTitle>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {fileName}
                </p>
                <DialogDescription className="sr-only">
                  Upload progress for {fileName}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {hasError && (
                  <div className="space-y-4">
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={onClose}
                        className="flex-1"
                        variant="outline"
                      >
                        Back to Form
                      </Button>
                      <Button
                        type="button"
                        onClick={onSubmitAnother}
                        className="flex-1"
                        variant="default"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Upload
                      </Button>
                    </div>
                  </div>
                )}

                {isCancelled && (
                  <div className="space-y-4">
                    <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      The upload was cancelled. No recording was submitted for processing.
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" onClick={onClose} className="flex-1" variant="outline">
                        Back to Form
                      </Button>
                      <Button type="button" onClick={onSubmitAnother} className="flex-1" variant="default">
                        <Plus className="mr-2 h-4 w-4" />
                        New Upload
                      </Button>
                    </div>
                  </div>
                )}

                {/* Progress Section */}
                {!isTerminal && <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex justify-between text-sm">
                        {isFinalizing ? (
                          <span className="text-muted-foreground">Creating your recording…</span>
                        ) : isPreparing ? (
                          <span className="text-muted-foreground">Requesting secure blob upload link...</span>
                        ) : isConverting ? (
                           <span className="text-muted-foreground">Preparing file for analysis...</span>
                        ) : (
                          <>
                            <span className="text-foreground">
                              {uploadedMB.toFixed(1)}
                              <span className="text-muted-foreground ml-1">MB</span>
                            </span>
                            <span className="text-muted-foreground">
                              of {totalMB.toFixed(1)} MB
                            </span>
                          </>
                        )}
                      </div>
                      <Progress
                        value={Math.min(percentage, 100)}
                        className="h-2"
                      />
                    </div>
                    <div className="text-right ml-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {percentage.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>}

                {/* Stats Grid - Only show when Uploading (not converting) */}
                {!isTerminal && !isConverting && !isFinalizing && !isPreparing && (
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {/* Speed */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Speed</p>
                      <p className="text-sm font-medium text-foreground">
                        {uploadSpeed.toFixed(1)} MB/s
                      </p>
                    </div>

                    {/* Time Elapsed */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Elapsed</p>
                      <p className="text-sm font-medium text-foreground">
                        {formatTime(elapsedSeconds)}
                      </p>
                    </div>

                    {/* Time Remaining */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Remaining</p>
                      <p className="text-sm font-medium text-foreground">
                        {uploadSpeed > 0 ? formatTime(remainingSeconds) : "—"}
                      </p>
                    </div>
                  </div>
                )}
                
                {!isTerminal && isConverting && (
                   <div className="text-xs text-muted-foreground text-center pt-2">
                     Conversion ensures best analysis quality. This may take a moment.
                   </div>
                )}

                {/* Success Message */}
                {!hasError && isComplete && (
                  <div className="pt-4 space-y-4">
                    <div className="text-center text-sm text-green-600 dark:text-green-400">
                      File uploaded successfully. Processing will begin shortly.
                    </div>
                    <Button
                      onClick={onSubmitAnother}
                      className="w-full"
                      variant="default"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Submit Another
                    </Button>
                  </div>
                )}

                {!isTerminal && !isConverting && !isFinalizing && canCancel && onCancel && (
                  <Button type="button" onClick={onCancel} className="w-full" variant="outline">
                    Cancel Upload
                  </Button>
                )}
              </div>
            </MotionDiv>
          </DialogContent>
        </Dialog>
    </AnimatePresence>
  );
}
