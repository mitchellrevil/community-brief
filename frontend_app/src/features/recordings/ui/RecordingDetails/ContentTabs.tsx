import type { TranscriptionSegment } from "@/lib/transcription-parser";
import { memo, useEffect, useState } from "react";
import {
  getAttemptFileName,
  getDisplayFilename,
  getFileType,
} from "@/components/lazy/documentViewerAttempts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MotionDiv } from "@/components/ui/motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateAnalysisDocument } from "@/features/recordings/data/api";
import { useAnalysisAttemptNavigation } from "@/hooks/useAnalysisAttemptNavigation";
import { AnimatePresence, fadeIn } from "@/lib/motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";

import { AnalysisTab } from "./AnalysisTab";
import { TranscriptionTab } from "./TranscriptionTab";

interface ContentTabsProps {
  transcriptionText: string | undefined;
  analysisText: string | undefined;
  analysisUpdateKey?: number;
  analysisFilePath: string | undefined;
  analysisAttempts?: Array<{
    attempt?: number;
    analysis_file_path: string;
    created_at?: string;
  }>;
  analysisInProgress?: boolean;
  jobId: string;
  createdAt: string;
  transcriptionFilePath: string | undefined;
  isTranscriptionProcessing: boolean;
  shouldShowTranscriptionError: boolean;
  transcriptionError: any;
  onRefetchTranscription: () => void;
  onReprocess?: () => void;
  onAnalysisUpdated?: (analysisText: string) => void;
  onSegmentClick: (segment: TranscriptionSegment) => void;
  onDownload: (url: string, fileName: string) => void;
  compact: boolean;
  isMobile: boolean;
  isTinyScreen: boolean;
}

/**
 * Main content tabs container for transcription and analysis
 * Handles tab switching and refresh functionality
 */
export const ContentTabs = memo(function ContentTabsView({
  transcriptionText,
  analysisText,
  analysisUpdateKey,
  analysisFilePath,
  analysisAttempts,
  analysisInProgress,
  jobId,
  createdAt,
  transcriptionFilePath,
  isTranscriptionProcessing,
  shouldShowTranscriptionError,
  transcriptionError,
  onRefetchTranscription,
  onReprocess,
  onAnalysisUpdated,
  onSegmentClick,
  onDownload,
  compact,
  isMobile,
  isTinyScreen,
}: ContentTabsProps) {
  const isRecent =
    Boolean(createdAt) &&
    new Date(createdAt).getTime() > Date.now() - 10 * 24 * 60 * 60 * 1000;
  const [activeTab, setActiveTab] = useState("transcription");
  const [isAnalysisEditing, setIsAnalysisEditing] = useState(false);
  const [isAnalysisSaving, setIsAnalysisSaving] = useState(false);
  const [analysisSaveRequestKey, setAnalysisSaveRequestKey] = useState(0);
  const {
    activeAnalysisFilePath,
    activeAttemptNumber,
    attemptIndex,
    normalizedAttempts,
    setAttemptIndex,
    shouldUseProvidedText,
    totalAttempts,
  } = useAnalysisAttemptNavigation({ analysisAttempts, analysisFilePath });
  const hasAnalysis = Boolean(
    (analysisText && analysisText.trim() !== "") ||
    analysisFilePath ||
    normalizedAttempts.length,
  );
  const showAnalysisControls = activeTab === "analysis" && hasAnalysis;
  const canEditActiveMarkdown =
    showAnalysisControls && getFileType(activeAnalysisFilePath) === "md";

  const downloadActiveAnalysis = () => {
    if (!activeAnalysisFilePath) return;
    onDownload(
      activeAnalysisFilePath,
      getAttemptFileName(
        getDisplayFilename(activeAnalysisFilePath),
        activeAttemptNumber,
      ),
    );
  };

  const saveActiveAnalysis = async (
    updatedContent: string,
    analysisPath?: string,
  ) => {
    await updateAnalysisDocument(jobId, updatedContent, analysisPath);
    onAnalysisUpdated?.(updatedContent);
  };

  useEffect(() => {
    if (analysisUpdateKey) {
      setActiveTab("analysis");
    }
  }, [analysisUpdateKey]);

  useEffect(() => {
    setIsAnalysisEditing(false);
    setIsAnalysisSaving(false);
  }, [activeAnalysisFilePath]);

  return (
    <Card className="border-border/50 bg-card/50 w-full overflow-hidden backdrop-blur-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <CardHeader className="xs:pb-3 pb-2 sm:pb-4">
          <div className="xs:gap-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <TabsList className="xs:gap-2 grid w-full grid-cols-2 gap-1 sm:w-auto">
              <TabsTrigger
                value="transcription"
                className="xs:gap-1.5 xs:text-xs xs:px-2 flex items-center gap-1 px-1.5 text-[0.7rem] sm:gap-2 sm:px-3 sm:text-sm"
              >
                <FileText className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" />
                <span className="truncate">Transcription</span>
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="xs:gap-1.5 xs:text-xs xs:px-2 flex items-center gap-1 px-1.5 text-[0.7rem] sm:gap-2 sm:px-3 sm:text-sm"
              >
                <FileText className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" />
                <span className="truncate">Analysis</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex w-full items-center justify-end gap-1 overflow-x-auto sm:ml-2 sm:w-auto sm:gap-2">
              {showAnalysisControls ? (
                <>
                  {onReprocess && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onReprocess}
                      disabled={analysisInProgress}
                      aria-label="Reprocess Analysis"
                      className="h-8 w-8 flex-shrink-0 px-0 sm:w-auto sm:px-3"
                    >
                      <RotateCcw
                        className={
                          analysisInProgress
                            ? "h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4"
                            : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                        }
                      />
                      <span className="ml-2 hidden sm:inline">Reprocess</span>
                    </Button>
                  )}
                  {canEditActiveMarkdown && (
                    <Button
                      variant={isAnalysisEditing ? "default" : "secondary"}
                      size="sm"
                      onClick={() => {
                        if (isAnalysisEditing) {
                          setAnalysisSaveRequestKey((key) => key + 1);
                          return;
                        }
                        setIsAnalysisEditing(true);
                      }}
                      disabled={isAnalysisSaving}
                      aria-label={
                        isAnalysisEditing
                          ? "Save Analysis"
                          : "Edit Analysis"
                      }
                      className="h-8 w-8 flex-shrink-0 px-0 sm:w-auto sm:px-3"
                    >
                      {isAnalysisSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                      ) : isAnalysisEditing ? (
                        <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">
                        {isAnalysisEditing ? "Save" : "Edit"}
                      </span>
                    </Button>
                  )}
                  {normalizedAttempts.length > 1 && (
                    <div className="bg-background/50 flex h-8 flex-shrink-0 items-center rounded-md border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setAttemptIndex((i) => Math.max(0, i - 1))
                        }
                        disabled={attemptIndex <= 0}
                        aria-label="Previous analysis attempt"
                        className="h-8 w-8 px-0 hover:bg-transparent"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <span className="text-muted-foreground px-1.5 text-xs sm:px-2">
                        {activeAttemptNumber}/{totalAttempts}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setAttemptIndex((i) =>
                            Math.min(normalizedAttempts.length - 1, i + 1),
                          )
                        }
                        disabled={attemptIndex >= normalizedAttempts.length - 1}
                        aria-label="Next analysis attempt"
                        className="h-8 w-8 px-0 hover:bg-transparent"
                      >
                        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  )}
                  {activeAnalysisFilePath && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={downloadActiveAnalysis}
                      aria-label="Download Analysis"
                      className="h-8 w-8 flex-shrink-0 px-0 sm:w-auto sm:px-3"
                    >
                      <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="ml-2 hidden sm:inline">Download</span>
                    </Button>
                  )}
                </>
              ) : transcriptionText ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRefetchTranscription}
                  disabled={isTranscriptionProcessing}
                  className="h-8 w-8 flex-shrink-0 px-0 sm:w-auto sm:px-3"
                >
                  {isTranscriptionProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin sm:h-4 sm:w-4" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 sm:h-4 sm:w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Refresh</span>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="xs:px-4 px-2 sm:px-6">
          <AnimatePresence mode="wait">
            {activeTab === "transcription" && (
              <TabsContent
                value="transcription"
                className="xs:space-y-4 mt-0 space-y-3"
                forceMount
              >
                <MotionDiv
                  key="transcription-tab"
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <TranscriptionTab
                    jobId={jobId}
                    transcriptionText={transcriptionText}
                    isProcessing={isTranscriptionProcessing}
                    shouldShowError={shouldShowTranscriptionError}
                    error={transcriptionError}
                    isRecent={isRecent}
                    transcriptionFilePath={transcriptionFilePath}
                    onRefetch={onRefetchTranscription}
                    onSegmentClick={onSegmentClick}
                    onDownload={onDownload}
                    compact={compact}
                    isMobile={isMobile}
                    isTinyScreen={isTinyScreen}
                  />
                </MotionDiv>
              </TabsContent>
            )}
            {activeTab === "analysis" && (
              <TabsContent
                value="analysis"
                className="xs:space-y-4 mt-0 space-y-3"
                forceMount
              >
                <MotionDiv
                  key="analysis-tab"
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <AnalysisTab
                    analysisText={analysisText}
                    analysisUpdateKey={analysisUpdateKey}
                    analysisFilePath={analysisFilePath}
                    activeAnalysisFilePath={activeAnalysisFilePath}
                    shouldUseProvidedText={shouldUseProvidedText}
                    analysisAttempts={analysisAttempts}
                    jobId={jobId}
                    isEditing={isAnalysisEditing}
                    saveRequestKey={analysisSaveRequestKey}
                    onEditingChange={setIsAnalysisEditing}
                    onSavingChange={setIsAnalysisSaving}
                    onSave={saveActiveAnalysis}
                    compact={compact}
                  />
                </MotionDiv>
              </TabsContent>
            )}
          </AnimatePresence>
        </CardContent>
      </Tabs>
    </Card>
  );
});
