import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Props for the ErrorBoundary component.
 */
interface ErrorBoundaryProps {
  /** The error that was caught */
  error: Error;
  /** Optional function to reset/retry the failed operation */
  reset?: () => void;
  /** Whether this error is from route loading (affects messaging) */
  isRouteError?: boolean;
}

/**
 * Error boundary component for displaying caught errors.
 *
 * Provides a user-friendly error display with recovery options:
 * - "Try again" button to retry the failed operation
 * - "Go Home" button to navigate to safety
 * - Development-only error stack trace
 *
 * @description Used as a fallback UI when errors occur in React components
 * or during route loading. Integrates with TanStack Router for navigation.
 *
 * @param {ErrorBoundaryProps} props - Component props
 *
 * @example
 * ```tsx
 * import { ErrorBoundary } from '@/components/error-boundary';
 *
 * // In a route error component
 * export function RouteError({ error, reset }: RouteErrorProps) {
 *   return <ErrorBoundary error={error} reset={reset} isRouteError />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With React error boundary
 * import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
 *
 * <ReactErrorBoundary
 *   FallbackComponent={({ error, resetErrorBoundary }) => (
 *     <ErrorBoundary error={error} reset={resetErrorBoundary} />
 *   )}
 * >
 *   <App />
 * </ReactErrorBoundary>
 * ```
 *
 * @accessibility
 * - Uses semantic HTML structure with Card components
 * - Error icon has implicit meaning; message provides context
 * - Action buttons are clearly labeled and focusable
 */
export function ErrorBoundary({ error, reset, isRouteError = false }: ErrorBoundaryProps) {
  const router = useRouter();

  const handleReset = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
          <CardDescription>
            {isRouteError ? "Failed to load this page" : "An unexpected error occurred"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 p-3 rounded-lg">
            <p className="text-sm font-mono text-destructive/80 break-words">
              {error.message || "Unknown error"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button
              onClick={handleGoHome}
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </div>

          {import.meta.env.MODE === "development" && (
            <details className="text-xs text-muted-foreground">
              <summary>Error details (dev only)</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-40">
                {error.stack}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
