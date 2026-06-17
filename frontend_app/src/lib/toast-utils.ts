/**
 * Enhanced Toast Notifications Utility
 * 
 * Provides rich toast notifications with actions, progress bars, and undo functionality.
 * 
 * Features:
 * - Action toasts with undo/retry
 * - Progress toasts that update dynamically
 * - Rich toasts with custom content
 * - Standardized messages for common scenarios
 * - Toast queue management
 */

import {  toast as sonnerToast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Info, Loader2, RotateCcw, XCircle } from "lucide-react";
import React from "react";
import type {ExternalToast} from "sonner";

/**
 * Toast types with icons
 */
const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

/**
 * Enhanced toast options
 */
export interface EnhancedToastOptions extends Omit<ExternalToast, 'icon'> {
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
  /** Show progress bar (0-100) */
  progress?: number;
  /** Make toast persistent (requires manual dismiss) */
  persistent?: boolean;
  /** Icon component to display (overrides default type icon) */
  iconComponent?: React.ComponentType<{ className?: string }>;
}

/**
 * Base enhanced toast function
 */
function enhancedToast(
  type: keyof typeof TOAST_ICONS,
  message: string,
  options: EnhancedToastOptions = {}
) {
  const {
    action,
    secondaryAction,
    progress,
    persistent,
    iconComponent: CustomIcon,
    ...sonnerOptions
  } = options;

  // Set duration based on options
  const duration = persistent 
    ? Infinity 
    : (action || secondaryAction) 
      ? 10000 // Longer for actionable toasts
      : sonnerOptions.duration || 4000;

  // Build action config
  const makeButton = (label: string, onClick: () => void | Promise<void>) => {
    return React.createElement(
      'button',
      {
        onClick: async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            console.debug('[toast-utils] action button clicked', { label });
            console.debug('[toast-utils] invoking action handler', { label });
            const result = await onClick();
            console.debug('[toast-utils] action handler completed', { label, result });
          } catch (error) {
            console.error('[toast-utils] Toast action failed:', error, { label });
          }
        },
        // Styles chosen to present a small contained button that blends with the toast
        // but behaves and scales like a real button. Prevent wrapping and enforce
        // a sensible min width so labels like "Undo" don't wrap to two lines.
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          minWidth: 72,
          padding: '6px 12px',
          borderRadius: 8,
          // subtle translucent background so it blends with light/dark toasts
          background: 'rgba(255,255,255,0.06)',
          // keep text color inherited from toast for decent contrast
          color: 'inherit',
          border: 'none',
          cursor: 'pointer',
        },
      },
      label
    );
  };

  const actionConfig = action ? makeButton(action.label, action.onClick) : undefined;

  // Build cancel config for secondary action
  const cancelConfig = secondaryAction ? makeButton(secondaryAction.label, secondaryAction.onClick) : undefined;

  // Select icon
  const Icon = CustomIcon || TOAST_ICONS[type];

  // Add progress style if needed
  const finalStyle = progress !== undefined ? {
    ...sonnerOptions.style,
    backgroundImage: `linear-gradient(to right, hsl(var(--primary) / 0.1) ${progress}%, transparent ${progress}%)`,
  } : sonnerOptions.style;

  return sonnerToast[type](message, {
    ...sonnerOptions,
    duration,
    action: actionConfig,
    cancel: cancelConfig,
    icon: React.createElement(Icon, { className: "h-5 w-5" }),
    style: finalStyle,
  });
}

/**
 * Success toast with optional action
 */
export function toastSuccess(message: string, options?: EnhancedToastOptions) {
  return enhancedToast("success", message, options);
}

/**
 * Error toast with optional retry action
 */
export function toastError(message: string, options?: EnhancedToastOptions) {
  return enhancedToast("error", message, {
    duration: 6000, // Longer for errors
    ...options,
  });
}

/**
 * Warning toast
 */
export function toastWarning(message: string, options?: EnhancedToastOptions) {
  return enhancedToast("warning", message, options);
}

/**
 * Info toast
 */
export function toastInfo(message: string, options?: EnhancedToastOptions) {
  return enhancedToast("info", message, options);
}

/**
 * Loading toast with progress support
 */
export function toastLoading(message: string, options?: EnhancedToastOptions) {
  return enhancedToast("loading", message, {
    duration: Infinity, // Loading toasts don't auto-dismiss
    ...options,
  });
}

/**
 * Progress toast that can be updated
 */
export class ProgressToast {
  private toastId: string | number;
  private _progress = 0;

  constructor(message: string, description?: string) {
    this.toastId = toastLoading(message, {
      description: description || "0%",
    });
  }

  /**
   * Update progress (0-100)
   */
  update(progress: number, message?: string) {
    this._progress = Math.max(0, Math.min(100, progress));
    sonnerToast.loading(message || "Processing...", {
      id: this.toastId,
      description: `${Math.round(this._progress)}%`,
      style: {
        backgroundImage: `linear-gradient(to right, hsl(var(--primary) / 0.1) ${this._progress}%, transparent ${this._progress}%)`,
      },
    });
  }

  /**
   * Complete with success
   */
  success(message: string, description?: string) {
    sonnerToast.success(message, {
      id: this.toastId,
      description,
      duration: 4000,
    });
  }

  /**
   * Complete with error
   */
  error(message: string, description?: string, options?: EnhancedToastOptions) {
    sonnerToast.error(message, {
      id: this.toastId,
      description,
      duration: 6000,
      ...options,
    });
  }

  /**
   * Dismiss the toast
   */
  dismiss() {
    sonnerToast.dismiss(this.toastId);
  }

  /**
   * Get current progress
   */
  get progress() {
    return this._progress;
  }
}

/**
 * Action toast with undo functionality
 */
export function toastUndo(
  message: string,
  onUndo: () => void | Promise<void>,
  options?: Omit<EnhancedToastOptions, "action">
) {
  return toastSuccess(message, {
    ...options,
    action: {
      label: "Undo",
      onClick: onUndo,
    },
    duration: 10000, // Longer duration for undo
  });
}

/**
 * Retry toast for failed operations
 */
export function toastRetry(
  message: string,
  onRetry: () => void | Promise<void>,
  options?: Omit<EnhancedToastOptions, "action">
) {
  return toastError(message, {
    ...options,
    action: {
      label: "Retry",
      onClick: onRetry,
    },
    iconComponent: RotateCcw,
  });
}

/**
 * Download toast with action
 */
export function toastDownload(
  message: string,
  onDownload: () => void | Promise<void>,
  options?: Omit<EnhancedToastOptions, "action">
) {
  return toastInfo(message, {
    ...options,
    action: {
      label: "Download",
      onClick: onDownload,
    },
    iconComponent: Download,
  });
}

/**
 * Promise toast - shows loading, then success/error based on promise result
 */
export function toastPromise<T>(
  promise: Promise<T>,
  {
    loading,
    success,
    error: errorMessage,
  }: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }
) {
  return sonnerToast.promise(promise, {
    loading,
    success,
    error: errorMessage,
  });
}

// ============================================================================
// Standardized Toast Messages for Common Scenarios
// ============================================================================

/**
 * Recording-related toasts
 */
export const recordingToasts = {
  started: () => toastInfo("Recording started", { description: "Speak clearly into your microphone" }),
  
  stopped: () => toastInfo("Recording stopped", { description: "Processing audio..." }),
  
  paused: () => toastInfo("Recording paused", { description: "Click resume to continue" }),
  
  resumed: () => toastInfo("Recording resumed"),
  
  empty: () => toastWarning("Recording is empty", { 
    description: "No audio detected. Please try again." 
  }),
  
  tooShort: (minDuration: number) => toastWarning("Recording too short", {
    description: `Minimum duration is ${minDuration} seconds`
  }),
  
  draftSaved: () => toastSuccess("Draft saved", {
    description: "Your recording has been saved locally"
  }),
  
  draftRestored: (onDiscard: () => void) => toastInfo("Draft recording available", {
    description: "Would you like to resume or start fresh?",
    action: {
      label: "Discard",
      onClick: onDiscard,
    },
    duration: 10000,
  }),
  
  microphoneError: () => toastError("Microphone access denied", {
    description: "Please allow microphone access in your browser settings",
    persistent: true,
  }),
  
  qualityWarning: (level: "low" | "high") => toastWarning(
    level === "low" ? "Audio level too low" : "Audio level too high",
    { description: level === "low" ? "Speak louder or move closer" : "Speak softer or move away" }
  ),
};

/**
 * Upload-related toasts
 */
export const uploadToasts = {
  started: () => {
    const toast = new ProgressToast("Uploading recording...", "Preparing file...");
    return toast;
  },
  
  converting: () => toastLoading("Converting audio...", {
    description: "Optimizing file format"
  }),
  
  success: (options?: { onView?: () => void; jobId?: string }) => {
    // Provide a fallback navigation if a jobId is present but no onView handler
    const action = options?.onView
      ? { label: "View Recording", onClick: options.onView }
      : options?.jobId
        ? { label: "View Recording", onClick: () => { window.location.href = `/audio-recordings/${options.jobId}`; } }
        : undefined;

    return toastSuccess("Upload complete!", {
      description: options?.jobId
        ? `Your recording is being processed (ID: ${options.jobId.slice(0, 8)}...)`
        : "Your recording is being processed",
      action,
      duration: 6000,
    });
  },
  
  failed: (options: { 
    onRetry?: () => void; 
    onDownload?: () => void; 
    onViewDetails?: () => void;
    errorMessage?: string;
  }) => toastError("Upload failed", {
    description: options.errorMessage || "Connection interrupted",
    action: options.onRetry ? {
      label: "Retry",
      onClick: options.onRetry,
    } : undefined,
    secondaryAction: options.onViewDetails ? {
      label: "View Details",
      onClick: options.onViewDetails,
    } : (options.onDownload ? {
      label: "Download",
      onClick: options.onDownload,
    } : undefined),
    persistent: true,
  }),
  
  retrying: (attempt: number, maxAttempts: number) => toastLoading(
    `Retrying upload (${attempt}/${maxAttempts})...`
  ),
  
  sizeTooLarge: (size: number, maxSize: number) => toastError("File too large", {
    description: `File is ${(size / (1024 * 1024)).toFixed(1)}MB. Maximum is ${maxSize}MB.`,
  }),
};

/**
 * Authentication toasts
 */
export const authToasts = {
  loginSuccess: () => toastSuccess("Login successful!", {
    description: "Redirecting..."
  }),
  
  loginFailed: (onRetry?: () => void) => toastError("Login failed", {
    description: "Please check your credentials and try again",
    action: onRetry ? {
      label: "Retry",
      onClick: onRetry,
    } : undefined,
  }),
  
  sessionExpired: () => toastWarning("Session expired", {
    description: "Please log in again",
    persistent: true,
  }),
  
  logoutSuccess: () => toastInfo("Logged out successfully"),
};

/**
 * File operation toasts
 */
export const fileToasts = {
  downloaded: (fileName: string) => toastSuccess(`${fileName} downloaded`),
  
  downloadFailed: (fileName: string, onRetry?: () => void) => toastError(`Failed to download ${fileName}`, {
    action: onRetry ? {
      label: "Retry",
      onClick: onRetry,
    } : undefined,
  }),
  
  copied: (label: string) => toastSuccess(`${label} copied to clipboard!`),
  
  copyFailed: (label: string) => toastError(`Failed to copy ${label}`),
  
  deleted: (fileName: string, options?: { onUndo?: () => void; onView?: () => void }) => {
    if (options?.onUndo) {
      return toastSuccess(`${fileName} deleted`, {
        action: {
          label: "Undo",
          onClick: options.onUndo,
        },
        secondaryAction: options.onView ? {
          label: "View Trash",
          onClick: options.onView,
        } : undefined,
        duration: 10000,
      });
    }
    return toastSuccess(`${fileName} deleted`, { description: "Moved to trash" });
  },
  
  restored: (fileName: string) => toastSuccess(`${fileName} restored`),
};

/**
 * Sharing toasts
 */
export const sharingToasts = {
  granted: (email: string, jobTitle: string, options?: { onView?: () => void; onCopyLink?: () => void }) => {
    return toastSuccess(`Shared with ${email}`, {
      description: `${jobTitle} is now accessible`,
      action: options?.onView ? {
        label: "View Recipients",
        onClick: options.onView,
      } : undefined,
      secondaryAction: options?.onCopyLink ? {
        label: "Copy Link",
        onClick: options.onCopyLink,
      } : undefined,
    });
  },
  
  revoked: (email: string) => {
    return toastSuccess(`Removed sharing with ${email}`);
  },
  
  failed: (email: string, error: string, options?: { onRetry?: () => void; onViewDetails?: () => void }) => {
    return toastError(`Failed to share with ${email}`, {
      description: error,
      action: options?.onRetry ? {
        label: "Retry",
        onClick: options.onRetry,
      } : undefined,
      secondaryAction: options?.onViewDetails ? {
        label: "View Details",
        onClick: options.onViewDetails,
      } : undefined,
    });
  },
  
  linkCopied: () => toastSuccess("Share link copied to clipboard!"),
};

/**
 * Permission toasts
 */
export const permissionToasts = {
  updated: (permission: string) => toastSuccess(`Permission updated to ${permission}`),
  
  denied: (action: string) => toastError("Permission denied", {
    description: `You don't have permission to ${action}`
  }),
  
  delegated: () => toastSuccess("Permission delegated successfully"),
  
  revoked: () => toastSuccess("Permission delegation revoked"),
};

/**
 * Settings toasts
 */
export const settingsToasts = {
  saved: (setting?: string) => toastSuccess(
    setting ? `${setting} saved` : "Settings saved",
    { description: "Changes have been applied" }
  ),
  
  failed: (setting?: string) => toastError(
    setting ? `Failed to save ${setting}` : "Failed to save settings"
  ),
  
  reset: () => toastInfo("Settings reset to defaults"),
};

/**
 * Storage toasts
 */
export const storageToasts = {
  almostFull: (percentage: number) => toastWarning("Storage almost full", {
    description: `${percentage}% of available storage used. Consider clearing old recordings.`,
    persistent: true,
  }),
  
  full: () => toastError("Storage full", {
    description: "Delete old recordings or clear browser data to continue",
    persistent: true,
  }),
  
  usageHigh: (percentage: number) => toastInfo("Storage usage high", {
    description: `${percentage}% of available storage used`
  }),
};
