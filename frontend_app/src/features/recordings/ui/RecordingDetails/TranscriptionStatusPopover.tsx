import { memo, useEffect, useId, useRef } from 'react';
import { CircleCheckBig, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Default auto-dismiss timeout in milliseconds (60 seconds)
 */
const DEFAULT_AUTO_DISMISS_MS = 60000;

interface TranscriptionStatusPopoverProps {
  /** Whether the popover is currently open */
  open: boolean;
  /** Callback when the popover's open state should change */
  onOpenChange: (open: boolean) => void;
  /** Time in milliseconds before auto-dismissing (default: 60000ms / 60s) */
  autoDismissMs?: number;
  /** Optional className for styling overrides */
  className?: string;
}

/**
 * TranscriptionStatusPopover
 *
 * A dismissible, animated popover that notifies users their audio is being
 * processed and they can safely leave the page. Auto-dismisses after a
 * configurable timeout (default 60 seconds).
 *
 * Features:
 * - Auto-dismiss timer that clears on unmount
 * - Accessible with role="alert" and aria-describedby
 * - Animated entrance and exit using Tailwind animation classes
 * - Manual dismiss via X button
 *
 * @example
 * ```tsx
 * <TranscriptionStatusPopover
 *   open={showPopover}
 *   onOpenChange={setShowPopover}
 *   autoDismissMs={30000} // optional: override 60s default
 * />
 * ```
 */
export const TranscriptionStatusPopover = memo(function TranscriptionStatusPopoverView({
  open,
  onOpenChange,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  className,
}: TranscriptionStatusPopoverProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionId = useId();

  // Auto-dismiss timer
  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Start timer only if popover is open
    if (open && autoDismissMs > 0) {
      timerRef.current = setTimeout(() => {
        onOpenChange(false);
      }, autoDismissMs);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, autoDismissMs, onOpenChange]);

  // Only render content when open
  if (!open) {
    return null;
  }

  const handleDismiss = () => {
    onOpenChange(false);
  };

  return (
    <div
      role="alert"
      aria-describedby={descriptionId}
      data-state="open"
      className={cn(
        // Base styles
        'bg-popover text-popover-foreground',
        'rounded-lg border border-border shadow-lg',
        'p-4 max-w-sm',
        // Animation classes
        'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2',
        'duration-200',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Success icon */}
        <div className="flex-shrink-0 mt-0.5">
          <CircleCheckBig
            data-testid="success-icon"
            className="h-5 w-5 text-green-500"
            aria-hidden="true"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p id={descriptionId} className="text-sm leading-relaxed">
            <span className="font-medium">Your audio is being processed.</span>
            {' '}
            <span className="text-muted-foreground">You can safely leave this page.</span>
          </p>
        </div>

        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="flex-shrink-0 h-6 w-6 -mt-1 -mr-1 hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
});
