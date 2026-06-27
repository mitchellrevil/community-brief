import { memo, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { TranscriptionTab } from './TranscriptionTab';
import { AnalysisTab } from './AnalysisTab';
import type { TranscriptionSegment } from '@/lib/transcription-parser';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AnimatePresence, fadeIn } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

interface ContentTabsProps {
  transcriptionText: string | undefined;
  analysisText: string | undefined;
  analysisUpdateKey?: number;
  analysisFilePath: string | undefined;
  analysisAttempts?: Array<{
    attempt?: number;
    analysis_file_path: string;
    created_at?: string;
  }>;  analysisInProgress?: boolean;  jobId: string;
  createdAt: string;
  transcriptionFilePath: string | undefined;
  isTranscriptionProcessing: boolean;
  shouldShowTranscriptionError: boolean;
  transcriptionError: any;
  onRefetchTranscription: () => void;
  onReprocess?: () => void;
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
  onSegmentClick,
  onDownload,
  compact,
  isMobile,
  isTinyScreen,
}: ContentTabsProps) {
  const isRecent = Boolean(createdAt) && new Date(createdAt).getTime() > Date.now() - 10 * 24 * 60 * 60 * 1000;
  const [activeTab, setActiveTab] = useState('transcription');

  useEffect(() => {
    if (analysisUpdateKey) {
      setActiveTab('analysis');
    }
  }, [analysisUpdateKey]);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm w-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <CardHeader className="pb-2 xs:pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 xs:gap-3 sm:gap-0 sm:justify-between">
            <TabsList className="grid grid-cols-2 gap-1 xs:gap-2 w-full sm:w-auto">
              <TabsTrigger value="transcription" className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 text-[0.7rem] xs:text-xs sm:text-sm px-1.5 xs:px-2 sm:px-3">
                <FileText className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Transcription</span>
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 text-[0.7rem] xs:text-xs sm:text-sm px-1.5 xs:px-2 sm:px-3">
                <FileText className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Analysis</span>
              </TabsTrigger>
            </TabsList>
            {transcriptionText && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefetchTranscription}
                disabled={isTranscriptionProcessing}
                className="w-8 px-0 sm:w-auto sm:px-3 sm:ml-2 h-8 flex-shrink-0"
              >
                {isTranscriptionProcessing ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin flex-shrink-0" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                )}
                <span className="hidden sm:inline ml-2">Refresh</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-2 xs:px-4 sm:px-6">
          <AnimatePresence mode="wait">
            {activeTab === 'transcription' && (
              <TabsContent value="transcription" className="mt-0 space-y-3 xs:space-y-4" forceMount>
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
            {activeTab === 'analysis' && (
              <TabsContent value="analysis" className="mt-0 space-y-3 xs:space-y-4" forceMount>
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
                    analysisAttempts={analysisAttempts}               analysisInProgress={analysisInProgress}              jobId={jobId}
                    onDownload={onDownload}
                    onReprocess={onReprocess}
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
