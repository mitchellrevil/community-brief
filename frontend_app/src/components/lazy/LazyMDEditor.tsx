import { Component,   Suspense, lazy, memo } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type {ErrorInfo, ReactNode} from 'react';
import { cn } from '@/lib/utils';

// Lazy load the MDEditor component
// Note: @uiw/react-md-editor has a default export
const LazyMDEditorComponent = lazy(() => import('@uiw/react-md-editor'));

// Also lazy load the CSS to avoid blocking
// Note: CSS is loaded as a side effect when the component loads

/**
 * Loading fallback component for the markdown editor
 * Matches the editor's typical height and shows a loading spinner
 */
export function EditorLoadingFallback({ 
  height = 300,
  className 
}: { 
  height?: number;
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "border rounded-md bg-muted/30 flex items-center justify-center",
        className
      )}
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading editor...</span>
      </div>
    </div>
  );
}

/**
 * Error fallback UI when editor fails to load
 */
function EditorErrorFallback({ 
  error,
  onRetry,
  height = 300 
}: { 
  error: Error;
  onRetry?: () => void;
  height?: number;
}) {
  return (
    <div 
      className="border border-destructive/30 rounded-md bg-destructive/5 flex items-center justify-center p-4"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div>
          <p className="font-medium text-destructive">Failed to load editor</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm text-primary hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

interface EditorErrorBoundaryProps {
  children: ReactNode;
  height?: number;
  onRetry?: () => void;
}

interface EditorErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for catching errors during editor loading
 */
export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  constructor(props: EditorErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('LazyMDEditor failed to load:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <EditorErrorFallback 
          error={this.state.error}
          onRetry={this.handleRetry}
          height={this.props.height}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Props for the LazyMDEditor component
 * Extends MDEditor props with additional lazy-loading specific options
 */
interface LazyMDEditorProps {
  value?: string;
  onChange?: (value?: string) => void;
  height?: number;
  preview?: 'live' | 'edit' | 'preview';
  hideToolbar?: boolean;
  visibleDragbar?: boolean;
  className?: string;
  'data-color-mode'?: 'light' | 'dark';
}

/**
 * Lazy-loaded markdown editor component
 * 
 * Wraps @uiw/react-md-editor with Suspense and error boundary for
 * optimal loading performance. The ~500KB MDEditor library is only
 * loaded when this component renders.
 * 
 * @example
 * ```tsx
 * <LazyMDEditor
 *   value={content}
 *   onChange={setContent}
 *   height={500}
 *   preview="edit"
 * />
 * ```
 */
function LazyMDEditorInner({
  value,
  onChange,
  height = 300,
  preview = 'edit',
  hideToolbar = false,
  visibleDragbar = false,
  className,
  'data-color-mode': colorMode,
}: LazyMDEditorProps) {
  return (
    <EditorErrorBoundary height={height}>
      <Suspense fallback={<EditorLoadingFallback height={height} className={className} />}>
        <div className={className} data-color-mode={colorMode}>
          <LazyMDEditorComponent
            value={value}
            onChange={onChange}
            height={height}
            preview={preview}
            hideToolbar={hideToolbar}
            visibleDragbar={visibleDragbar}
          />
        </div>
      </Suspense>
    </EditorErrorBoundary>
  );
}

// Export memoized component to prevent unnecessary re-renders
export const LazyMDEditor = memo(LazyMDEditorInner);
