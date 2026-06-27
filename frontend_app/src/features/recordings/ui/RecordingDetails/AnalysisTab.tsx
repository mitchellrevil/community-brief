import { LazyDocumentViewer } from "@/components/lazy/LazyDocumentViewer";
import { FileText } from "lucide-react";

interface AnalysisTabProps {
  analysisText: string | undefined;
  analysisUpdateKey?: number;
  analysisFilePath: string | undefined;
  activeAnalysisFilePath?: string;
  shouldUseProvidedText?: boolean;
  analysisAttempts?: Array<{
    attempt?: number;
    analysis_file_path: string;
    created_at?: string;
  }>;
  jobId: string;
  isEditing?: boolean;
  saveRequestKey?: number;
  onEditingChange?: (isEditing: boolean) => void;
  onSavingChange?: (isSaving: boolean) => void;
  onSave?: (updatedContent: string, analysisFilePath?: string) => Promise<void>;
  compact: boolean;
}

/**
 * Analysis tab content with conditional rendering
 * Displays analysis document or loading state
 */
export function AnalysisTab({
  analysisText,
  analysisUpdateKey,
  analysisFilePath,
  activeAnalysisFilePath,
  shouldUseProvidedText,
  analysisAttempts,
  jobId,
  isEditing,
  saveRequestKey,
  onEditingChange,
  onSavingChange,
  onSave,
  compact,
}: AnalysisTabProps) {
  const hasAnalysis =
    (analysisText && analysisText.trim() !== "") ||
    analysisFilePath ||
    (analysisAttempts?.length ?? 0) > 0;

  if (hasAnalysis) {
    return (
      <div className="space-y-3">
        <LazyDocumentViewer
          analysisText={analysisText || ""}
          analysisUpdateKey={analysisUpdateKey}
          analysisFilePath={analysisFilePath}
          activeAnalysisFilePath={activeAnalysisFilePath}
          shouldUseProvidedText={shouldUseProvidedText}
          jobId={jobId}
          isEditing={isEditing}
          saveRequestKey={saveRequestKey}
          onEditingChange={onEditingChange}
          onSavingChange={onSavingChange}
          onSave={onSave}
          compact={compact}
        />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in flex flex-col items-center justify-center space-y-4 py-12 duration-500">
      <div className="bg-muted rounded-full p-3">
        <FileText className="text-muted-foreground h-6 w-6" />
      </div>
      <div className="space-y-2 text-center">
        <h3 className="font-medium">Analysis in progress</h3>
        <p className="text-muted-foreground text-sm">
          AI is generating insights from your transcription
        </p>
      </div>
    </div>
  );
}
