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

import { useEffect, useState } from "react";
import { Check, Eye, Music, Plus, Upload } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
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
  /** Whether file is being converted before upload */
  isConverting?: boolean;
  /** Conversion progress (0-100) */
  conversionProgress?: number;
}

export function UploadProgressSimulator({
  isActive,
  progress,
  onComplete,
  show = true,
  fileName = "File",
  onSubmitAnother,
  isConverting = false,
  conversionProgress = 0,
}: UploadProgressProps) {
  const router = useRouter();
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [isComplete, setIsComplete] = useState(false);
  const [startTime] = useState(Date.now());
  const [wasActiveLastRender, setWasActiveLastRender] = useState(isActive);

  const handleViewRecording = () => {
    router.navigate({ to: "/audio-recordings" });
  };

  useEffect(() => {
    // If simply converting, we are not "complete" yet.
    if (isConverting) return;

    // Track when upload finishes (isActive goes from true to false)
    const progressPercentage = progress?.percentage;
    if (wasActiveLastRender && !isActive && typeof progressPercentage === "number" && progressPercentage >= 99) {
      // Upload mutation completed successfully (got 201 response)
      setIsComplete(true);
      setTimeout(() => {
        onComplete?.();
      }, 1500);
    }
    setWasActiveLastRender(isActive);

    // Reset completion state when starting a new upload
    if (!isActive || !show || !progress) {
      setIsComplete(false);
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
  }, [progress?.percentage, isActive, show, isComplete, onComplete, startTime, wasActiveLastRender, isConverting, progress]);

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
                  {isComplete ? (
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : isConverting ? (
                    <Music className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                  ) : (
                    <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                  )}
                  <DialogTitle>
                    {isComplete ? "Upload Complete" : isConverting ? "Converting Audio..." : "Uploading..."}
                  </DialogTitle>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {fileName}
                </p>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Progress Section */}
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex justify-between text-sm">
                        {isConverting ? (
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
                </div>

                {/* Stats Grid - Only show when Uploading (not converting) */}
                {!isConverting && !isComplete && (
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
                
                {isConverting && (
                   <div className="text-xs text-muted-foreground text-center pt-2">
                     Conversion ensures best analysis quality. This may take a moment.
                   </div>
                )}

                {/* Success Message */}
                {isComplete && (
                  <div className="pt-4 space-y-4">
                    <div className="text-center text-sm text-green-600 dark:text-green-400">
                      File uploaded successfully. Processing will begin shortly.
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleViewRecording}
                        className="flex-1"
                        variant="default"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Recording
                      </Button>
                      <Button
                        onClick={onSubmitAnother}
                        className="flex-1"
                        variant="outline"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Submit Another
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </MotionDiv>
          </DialogContent>
        </Dialog>
    </AnimatePresence>
  );
}
