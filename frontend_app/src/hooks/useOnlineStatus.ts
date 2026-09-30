import { useEffect, useState } from 'react';
import { watchOnlineStatus } from '@/lib/online-status';

/**
 * Hook to track online/offline status with real backend connectivity check.
 *
 * Provides reactive online status updates using the visibility-aware connectivity
 * monitoring system. The hook subscribes to status changes and automatically
 * updates when connectivity state changes.
 *
 * @description Uses navigator.onLine as initial state with backend ping verification.
 * Triggers re-render whenever online status changes for seamless offline-aware UI.
 *
 * @returns {boolean} True if the application has network connectivity
 *
 * @example
 * ```tsx
 * import { useOnlineStatus } from '@/hooks/useOnlineStatus';
 *
 * function NetworkAwareComponent() {
 *   const isOnline = useOnlineStatus();
 *
 *   return (
 *     <div>
 *       {isOnline ? (
 *         <span className="text-green-500">Connected</span>
 *       ) : (
 *         <span className="text-red-500">Offline - Changes will sync later</span>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link watchOnlineStatus} for the underlying subscription mechanism
 * @see {@link useUploadQueue} for offline-aware file upload handling
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Subscribe to online status changes
    const unwatch = watchOnlineStatus((online) => {
      setIsOnline(online);
    });

    return () => {
      unwatch();
    };
  }, []);

  return isOnline;
}
