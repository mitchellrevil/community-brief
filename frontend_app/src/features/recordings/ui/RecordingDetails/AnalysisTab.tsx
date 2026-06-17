import { FileText } from 'lucide-react';
import { LazyDocumentViewer } from '@/components/lazy/LazyDocumentViewer';

interface AnalysisTabProps {
  analysisText: string | undefined;
  analysisFilePath: string | undefined;
  analysisAttempts?: Array<{
    attempt?: number;
    analysis_file_path: string;
    created_at?: string;
  }>;
  analysisInProgress?: boolean;
  jobId: string;
  onDownload: (url: string, fileName: string) => void;
  onReprocess?: () => void;
  compact: boolean;
}

/**
 * Analysis tab content with conditional rendering
 * Displays analysis document or loading state
 */
export function AnalysisTab({ analysisText, analysisFilePath, analysisAttempts, analysisInProgress, jobId, onDownload, onReprocess, compact }: AnalysisTabProps) {
  const hasAnalysis = (analysisText && analysisText.trim() !== '') || analysisFilePath;

  if (hasAnalysis) {
    return (
      <div className="space-y-3">
        <LazyDocumentViewer
          analysisText={analysisText || ''}
          analysisFilePath={analysisFilePath}
          analysisAttempts={analysisAttempts}
          analysisInProgress={analysisInProgress}
          jobId={jobId}
          isEditable={false}
          onDownload={onDownload}
          onReprocess={onReprocess}
          compact={compact}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in duration-500">
      <div className="rounded-full bg-muted p-3">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="font-medium">Analysis in progress</h3>
        <p className="text-sm text-muted-foreground">AI is generating insights from your transcription</p>
      </div>
    </div>
  );
}
