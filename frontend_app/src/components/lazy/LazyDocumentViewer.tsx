import { 
  Component, 
  Suspense, 
  lazy,
  memo,
  useEffect,
  useRef, 
  useState 
} from 'react';
import { 
  AlertTriangle, 
  Bug,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText, 
  Loader2,
  RotateCcw,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { useAnalysisAttemptNavigation } from '../../hooks/useAnalysisAttemptNavigation';
import {
  getAttemptFileName,
  getDisplayFilename,
  getFileType
} from './documentViewerAttempts';
import type {AnalysisAttempt} from './documentViewerAttempts';
import type {ErrorInfo, ReactNode} from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MarkdownRenderer } from '@/features/uploads/recording/MarkdownRenderer';

// Lazy load the MDEditor component for editing mode
const LazyMDEditorComponent = lazy(() => import('@uiw/react-md-editor'));

/**
 * Loading fallback for document viewer
 */
export function DocumentViewerLoadingFallback({ 
  height = 400,
  className 
}: { 
  height?: number;
  className?: string;
}) {
  return (
    <div 
      className={`flex flex-col items-center justify-center py-16 space-y-4 ${className || ''}`}
      style={{ minHeight: height }}
    >
      <div className="bg-muted p-4 rounded-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-foreground">Loading document...</p>
        <p className="text-sm text-muted-foreground">Please wait while we fetch the content</p>
      </div>
    </div>
  );
}

/**
 * Error fallback for document viewer
 */
function DocumentViewerErrorFallback({ 
  error,
  onRetry 
}: { 
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-[300px] flex flex-col items-center justify-center py-16 space-y-4">
      <div className="bg-destructive/10 p-4 rounded-full">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center space-y-1 max-w-sm">
        <p className="font-medium text-destructive">Failed to load document</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          <RotateCcw className="h-4 w-4 mr-2" />
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

  static getDerivedStateFromError(error: Error): DocumentViewerErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('LazyDocumentViewer failed to load:', error, errorInfo);
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
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

interface LazyDocumentViewerProps {
  analysisText: string;
  analysisFilePath?: string;
  analysisAttempts?: Array<AnalysisAttempt>;
  analysisInProgress?: boolean;
  jobId: string;
  isEditable: boolean;
  onSave?: (updatedContent: string) => Promise<void>;
  onDownload?: (filePath: string, fileName: string) => void;
  onReprocess?: () => void;
  compact?: boolean;
}

/**
 * Normalize escaped checkbox markup from backend
 */
const normalizeCheckboxes = (md: string) => {
  if (!md) return md;
  try {
    return md.replace(/\\\[\s*([xX ])\s*\\\]/g, (_m, g1) => {
      const c = (g1 || ' ').trim().toLowerCase() === 'x' ? 'x' : ' ';
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
  analysisFilePath,
  analysisAttempts,
  analysisInProgress,
  isEditable,
  onSave,
  onDownload,
  onReprocess,
}: LazyDocumentViewerProps) {
  const [fullContent, setFullContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [debugRawContent, setDebugRawContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const turndownServiceRef = useRef<TurndownService | null>(null);

  const {
    activeAnalysisFilePath,
    activeAttemptNumber,
    attemptIndex,
    normalizedAttempts,
    setAttemptIndex,
    shouldUseProvidedText,
    totalAttempts,
  } = useAnalysisAttemptNavigation({ analysisAttempts, analysisFilePath });

  const effectiveAnalysisText = shouldUseProvidedText ? analysisText : '';

  const hasRealAnalysisText = effectiveAnalysisText && 
    effectiveAnalysisText.trim() !== '' && 
    effectiveAnalysisText !== 'Loading analysis content...' &&
    effectiveAnalysisText.length > 20;

  const fileType = getFileType(activeAnalysisFilePath);

  // Load content with lazy-loaded mammoth/turndown
  useEffect(() => {
    const loadContent = async () => {
      if (hasRealAnalysisText) {
        const normalized = normalizeCheckboxes(effectiveAnalysisText);
        setDebugRawContent(normalized);
        setFullContent(normalized);
        setEditedContent(normalized);
        return;
      }
      
      if (activeAnalysisFilePath && fileType === 'docx') {
        setIsLoading(true);
        try {
          // Dynamically import mammoth - only when DOCX processing is needed
          const mammoth = await import('mammoth') as MammothModule;
          
          // Dynamically import turndown if not already loaded
          if (!turndownServiceRef.current) {
            const TurndownServiceClass = (await import('turndown')).default;
            const { gfm: turndownGfm } = await import('turndown-plugin-gfm');
            
            const service = new TurndownServiceClass({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced'
            }) as TurndownService;
            
            try {
              service.use(turndownGfm);
            } catch (err) {
              console.warn('turndown GFM plugin failed', err);
            }
            
            turndownServiceRef.current = service;
          }

          const response = await fetch(activeAnalysisFilePath);
          if (!response.ok) throw new Error(`Failed to fetch DOCX: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();

          const result = await mammoth.convertToHtml({ arrayBuffer });
          const html = result.value || '';
          
          if (html && html.trim().length > 20) {
            // turndownServiceRef.current is guaranteed to exist after the block above
            const markdown = turndownServiceRef.current.turndown(html);
            const normalized = normalizeCheckboxes(markdown);
            setDebugRawContent(normalized);
            setFullContent(normalized);
            setEditedContent(normalized);
          } else {
            setFullContent('');
          }
        } catch (err) {
          console.warn('DOCX extraction failed:', err);
          setFullContent('');
        } finally {
          setIsLoading(false);
        }
      } else if (activeAnalysisFilePath && (fileType === 'txt' || fileType === 'md')) {
        setIsLoading(true);
        try {
          const response = await fetch(activeAnalysisFilePath);
          if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
          const text = await response.text();
          const normalized = normalizeCheckboxes(text);
          setDebugRawContent(normalized);
          setFullContent(normalized);
          setEditedContent(normalized);
        } catch (err) {
          console.error(err);
          setFullContent('');
        } finally {
          setIsLoading(false);
        }
      } else {
        setFullContent('');
      }
    };

    loadContent();
  }, [effectiveAnalysisText, hasRealAnalysisText, activeAnalysisFilePath, fileType]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editedContent);
      setFullContent(editedContent);
      setIsEditing(false);
      setShowSaveDialog(false);
      toast.success('Analysis document updated successfully');
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(fullContent);
    setIsEditing(false);
  };

  if (isLoading) {
    return <DocumentViewerLoadingFallback />;
  }

  return (
    <div className="space-y-4">
      {/* Header with actions toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card/50 p-1 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-md">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Analysis Document</span>
              {normalizedAttempts.length > 1 && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                   Attempt {activeAttemptNumber}/{totalAttempts}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
               {isEditable ? (
                  <span className="flex items-center text-green-600 dark:text-green-500 font-medium">
                    Editable <span className="mx-1.5 opacity-30">|</span> {fileType.toUpperCase()}
                  </span>
               ) : (
                  <span>{fileType.toUpperCase()}</span>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 self-end sm:self-auto w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {onReprocess && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={onReprocess} variant="ghost" size="sm" className="h-8 w-8 px-0 sm:w-auto sm:px-3" disabled={analysisInProgress}>
                    <RotateCcw className={analysisInProgress ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    <span className="hidden sm:inline ml-2">Reprocess</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reprocess Analysis</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          {normalizedAttempts.length > 1 && (
            <div className="flex items-center border rounded-md bg-background/50">
              <Button variant="ghost" size="sm" onClick={() => setAttemptIndex((i) => Math.max(0, i - 1))} disabled={attemptIndex <= 0} className="h-8 w-8 px-0 hover:bg-transparent">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" onClick={() => setAttemptIndex((i) => Math.min(normalizedAttempts.length - 1, i + 1))} disabled={attemptIndex >= normalizedAttempts.length - 1} className="h-8 w-8 px-0 hover:bg-transparent">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {debugRawContent && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 px-0 sm:w-auto sm:px-2 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(debugRawContent); toast.success("Raw markdown copied"); }}>
                    <Bug className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy Raw Markdown</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {isEditable && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => { if (!fullContent) { setFullContent('Start writing...'); setEditedContent('Start writing...'); } setIsEditing(true); }} className="h-8 gap-2 ml-1">
              <Edit3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          )}

          {activeAnalysisFilePath && onDownload && (
            normalizedAttempts.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2">
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Download Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      onDownload(
                        activeAnalysisFilePath,
                        getAttemptFileName(
                          getDisplayFilename(activeAnalysisFilePath),
                          activeAttemptNumber,
                        ),
                      )
                    }
                  >
                    Current (Attempt {activeAttemptNumber})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onDownload(
                    activeAnalysisFilePath,
                    getAttemptFileName(
                      getDisplayFilename(activeAnalysisFilePath),
                      activeAttemptNumber,
                    ),
                  )
                }
                className="h-8 gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            )
          )}
        </div>
      </div>

      {/* Main document viewer */}
      <div className="min-h-[400px]">
        <div className='max-h-[600px] lg:max-h-[700px] xl:max-h-[800px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar'>
          {isEditing ? (
            <Suspense fallback={<div className="min-h-[500px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
              <div data-color-mode="light" className="min-h-[500px]">
                <LazyMDEditorComponent value={editedContent} onChange={(val) => setEditedContent(val || '')} preview="edit" height={600} visibleDragbar={false} className="w-full shadow-sm border rounded-lg overflow-hidden" />
              </div>
            </Suspense>
          ) : fullContent ? (
            <div className="animate-in fade-in duration-500 max-w-[85ch] mx-auto text-base pb-4">
              <div className="bg-background shadow-sm border rounded-xl px-4 py-6 sm:px-7 sm:py-1 min-h-[600px]">
                <MarkdownRenderer content={fullContent} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 space-y-6 text-center">
              <div className="bg-muted p-4 rounded-full">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="font-medium text-foreground">No analysis content</h3>
                <p className="text-sm text-muted-foreground text-pretty">
                  {activeAnalysisFilePath ? "Use the download button to view the file." : "Analysis is being processed or unavailable."}
                </p>
              </div>
            </div>
          )}
        </div>

        {isEditing && (
          <div className="sticky bottom-0 mt-4 pt-4 border-t bg-background/95 backdrop-blur flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Markdown supported</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleCancelEdit} disabled={isSaving} size="sm">Cancel</Button>
              <Button onClick={() => setShowSaveDialog(true)} disabled={isSaving} size="sm" className="gap-2">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Save confirmation dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Are you sure you want to save these changes?</p>
            <div className="bg-muted/30 rounded-md p-3 text-xs border">
              <span className="font-mono text-muted-foreground">{getDisplayFilename(activeAnalysisFilePath)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Confirm Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Lazy-loaded document viewer component
 */
export const LazyDocumentViewer = memo(function LazyDocumentViewerView(props: LazyDocumentViewerProps) {
  return (
    <DocumentViewerErrorBoundary>
      <LazyDocumentViewerInner {...props} />
    </DocumentViewerErrorBoundary>
  );
});
