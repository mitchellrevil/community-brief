import type { ErrorInfo, ReactNode } from "react";
import {
  Component,
  lazy,
  memo,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/features/uploads/recording/MarkdownRenderer";
import {
  AlertTriangle,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { getFileType } from "./documentViewerAttempts";

// Lazy load the MDEditor component for editing mode
const LazyMDEditorComponent = lazy(() => import("@uiw/react-md-editor"));

/**
 * Loading fallback for document viewer
 */
export function DocumentViewerLoadingFallback({
  height = 400,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center space-y-4 py-16 ${className || ""}`}
      style={{ minHeight: height }}
    >
      <div className="bg-muted rounded-full p-4">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
      <div className="space-y-1 text-center">
        <p className="text-foreground font-medium">Loading document...</p>
        <p className="text-muted-foreground text-sm">
          Please wait while we fetch the content
        </p>
      </div>
    </div>
  );
}

/**
 * Error fallback for document viewer
 */
function DocumentViewerErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 py-16">
      <div className="bg-destructive/10 rounded-full p-4">
        <AlertTriangle className="text-destructive h-8 w-8" />
      </div>
      <div className="max-w-sm space-y-1 text-center">
        <p className="text-destructive font-medium">Failed to load document</p>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}

interface DocumentViewerErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface DocumentViewerErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the document viewer
 */
export class DocumentViewerErrorBoundary extends Component<
  DocumentViewerErrorBoundaryProps,
  DocumentViewerErrorBoundaryState
> {
  constructor(props: DocumentViewerErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(
    error: Error,
  ): DocumentViewerErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("LazyDocumentViewer failed to load:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <DocumentViewerErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// Types for lazy-loaded libraries
type TurndownService = {
  turndown: (html: string) => string;
  use: (plugin: unknown) => void;
};

type MammothModule = {
  convertToHtml: (input: {
    arrayBuffer: ArrayBuffer;
  }) => Promise<{ value: string }>;
};

interface LazyDocumentViewerProps {
  analysisText: string;
  analysisUpdateKey?: number;
  analysisFilePath?: string;
  activeAnalysisFilePath?: string;
  shouldUseProvidedText?: boolean;
  jobId: string;
  isEditing?: boolean;
  saveRequestKey?: number;
  onEditingChange?: (isEditing: boolean) => void;
  onSavingChange?: (isSaving: boolean) => void;
  onSave?: (updatedContent: string, analysisFilePath?: string) => Promise<void>;
  compact?: boolean;
}

/**
 * Normalize escaped checkbox markup from backend
 */
const normalizeCheckboxes = (md: string) => {
  if (!md) return md;
  try {
    return md.replace(/\\\[\s*([xX ])\s*\\\]/g, (_m, g1) => {
      const c = (g1 || " ").trim().toLowerCase() === "x" ? "x" : " ";
      return `[${c}]`;
    });
  } catch {
    return md;
  }
};

/**
 * Inner component that handles the document viewing logic
 */
function LazyDocumentViewerInner({
  analysisText,
  analysisUpdateKey,
  analysisFilePath,
  activeAnalysisFilePath: providedActiveAnalysisFilePath,
  shouldUseProvidedText = true,
  isEditing: controlledIsEditing,
  saveRequestKey = 0,
  onEditingChange,
  onSavingChange,
  onSave,
}: LazyDocumentViewerProps) {
  const [fullContent, setFullContent] = useState<string>("");
  const [editedContent, setEditedContent] = useState<string>("");
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isContentChanging, setIsContentChanging] = useState(false);

  const turndownServiceRef = useRef<TurndownService | null>(null);
  const contentChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const activeAnalysisFilePath =
    providedActiveAnalysisFilePath || analysisFilePath;
  const effectiveAnalysisText = shouldUseProvidedText ? analysisText : "";

  const hasRealAnalysisText =
    effectiveAnalysisText &&
    effectiveAnalysisText.trim() !== "" &&
    effectiveAnalysisText !== "Loading analysis content..." &&
    effectiveAnalysisText.length > 20;

  const fileType = getFileType(activeAnalysisFilePath);
  const canEditMarkdown = fileType === "md" && Boolean(onSave);
  const isEditing = canEditMarkdown
    ? (controlledIsEditing ?? internalIsEditing)
    : false;

  const setEditing = (nextIsEditing: boolean) => {
    setInternalIsEditing(nextIsEditing);
    onEditingChange?.(nextIsEditing);
  };

  // Load content with lazy-loaded mammoth/turndown
  useEffect(() => {
    const loadContent = async () => {
      if (hasRealAnalysisText) {
        const normalized = normalizeCheckboxes(effectiveAnalysisText);
        setFullContent(normalized);
        setEditedContent(normalized);
        return;
      }

      if (activeAnalysisFilePath && fileType === "docx") {
        setIsLoading(true);
        try {
          // Dynamically import mammoth - only when DOCX processing is needed
          const mammoth = (await import("mammoth")) as MammothModule;

          // Dynamically import turndown if not already loaded
          if (!turndownServiceRef.current) {
            const TurndownServiceClass = (await import("turndown")).default;
            const { gfm: turndownGfm } = await import("turndown-plugin-gfm");

            const service = new TurndownServiceClass({
              headingStyle: "atx",
              codeBlockStyle: "fenced",
            }) as TurndownService;

            try {
              service.use(turndownGfm);
            } catch (err) {
              console.warn("turndown GFM plugin failed", err);
            }

            turndownServiceRef.current = service;
          }

          const response = await fetch(activeAnalysisFilePath);
          if (!response.ok)
            throw new Error(`Failed to fetch DOCX: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();

          const result = await mammoth.convertToHtml({ arrayBuffer });
          const html = result.value || "";

          if (html && html.trim().length > 20) {
            // turndownServiceRef.current is guaranteed to exist after the block above
            const markdown = turndownServiceRef.current.turndown(html);
            const normalized = normalizeCheckboxes(markdown);
            setFullContent(normalized);
            setEditedContent(normalized);
          } else {
            setFullContent("");
          }
        } catch (err) {
          console.warn("DOCX extraction failed:", err);
          setFullContent("");
        } finally {
          setIsLoading(false);
        }
      } else if (
        activeAnalysisFilePath &&
        (fileType === "txt" || fileType === "md")
      ) {
        setIsLoading(true);
        try {
          const response = await fetch(activeAnalysisFilePath);
          if (!response.ok)
            throw new Error(`Failed to fetch: ${response.status}`);
          const text = await response.text();
          const normalized = normalizeCheckboxes(text);
          setFullContent(normalized);
          setEditedContent(normalized);
        } catch (err) {
          console.error(err);
          setFullContent("");
        } finally {
          setIsLoading(false);
        }
      } else {
        setFullContent("");
      }
    };

    loadContent();
  }, [
    effectiveAnalysisText,
    hasRealAnalysisText,
    activeAnalysisFilePath,
    fileType,
  ]);

  useEffect(() => {
    if (!analysisUpdateKey) return;
    setIsContentChanging(true);
    if (contentChangeTimeoutRef.current) {
      clearTimeout(contentChangeTimeoutRef.current);
    }
    contentChangeTimeoutRef.current = setTimeout(
      () => setIsContentChanging(false),
      1200,
    );
  }, [analysisUpdateKey]);

  useEffect(
    () => () => {
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }
    },
    [],
  );

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editedContent, activeAnalysisFilePath);
      setFullContent(editedContent);
      setEditing(false);
      toast.success("Analysis document updated successfully");
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(fullContent);
    setEditing(false);
  };

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  useEffect(() => {
    if (!saveRequestKey || !isEditing) return;
    void handleSave();
  }, [saveRequestKey]);

  if (isLoading) {
    return <DocumentViewerLoadingFallback />;
  }

  return (
    <div className="space-y-4">
      {/* Main document viewer */}
      <div className="min-h-[400px]">
        <div className="custom-scrollbar max-h-[600px] overflow-y-auto pr-1 sm:pr-2 lg:max-h-[700px] xl:max-h-[800px]">
          {isEditing ? (
            <Suspense
              fallback={
                <div className="flex min-h-[500px] items-center justify-center">
                  <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                </div>
              }
            >
              <div data-color-mode="light" className="min-h-[500px]">
                <LazyMDEditorComponent
                  value={editedContent}
                  onChange={(val) => setEditedContent(val || "")}
                  preview="edit"
                  height={600}
                  visibleDragbar={false}
                  className="w-full overflow-hidden rounded-lg border shadow-sm"
                />
              </div>
            </Suspense>
          ) : fullContent ? (
            <div className="animate-in fade-in mx-auto max-w-[85ch] pb-4 text-base duration-500">
              <div
                className={`bg-background min-h-[600px] rounded-xl px-4 py-6 shadow-sm transition-all duration-500 sm:px-7 sm:py-1 ${
                  isContentChanging ? "shadow-primary/20 animate-pulse" : ""
                }`}
              >
                <MarkdownRenderer content={fullContent} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-6 py-24 text-center">
              <div className="bg-muted rounded-full p-4">
                <FileText className="text-muted-foreground/50 h-8 w-8" />
              </div>
              <div className="max-w-sm space-y-2">
                <h3 className="text-foreground font-medium">
                  No analysis content
                </h3>
                <p className="text-muted-foreground text-sm text-pretty">
                  {activeAnalysisFilePath
                    ? "Use the download button to view the file."
                    : "Analysis is being processed or unavailable."}
                </p>
              </div>
            </div>
          )}
        </div>

        {isEditing && (
          <div className="bg-background/95 sticky bottom-0 mt-4 flex items-center justify-between gap-4 border-t pt-4 backdrop-blur">
            <span className="text-muted-foreground text-xs">
              Markdown supported
            </span>
            <Button
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={isSaving}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lazy-loaded document viewer component
 */
export const LazyDocumentViewer = memo(function LazyDocumentViewerView(
  props: LazyDocumentViewerProps,
) {
  return (
    <DocumentViewerErrorBoundary>
      <LazyDocumentViewerInner {...props} />
    </DocumentViewerErrorBoundary>
  );
});
