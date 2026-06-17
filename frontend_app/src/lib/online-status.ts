import { SYSTEM_HEALTH_API } from "@/shared/api/constants";

/**
 * Online Status Detection Utility
 * 
 * Provides reliable online/offline detection beyond navigator.onLine
 * by pinging a health endpoint to verify actual connectivity.
 */

/**
 * Check if the application is truly online
 * navigator.onLine can give false positives, so we also ping the backend
 */
export async function isOnline(): Promise<boolean> {
  // First check: browser's network state
  if (!navigator.onLine) {
    return false;
  }

  // Second check: can we actually reach our backend?
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(SYSTEM_HEALTH_API, {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal,
      credentials: 'omit', // Don't send auth cookies for this check
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    // Network error or timeout - we're offline
    console.log('[online-status] Backend not reachable:', error);
    return false;
  }
}

/**
 * Watch for online/offline status changes
 * @param callback Function to call when status changes (true = online, false = offline)
 * @returns Cleanup function to remove event listeners
 */
export function watchOnlineStatus(callback: (isOnlineStatus: boolean) => void): () => void {
  const handleOnline = async () => {
    console.log('[online-status] Browser online event fired');
    // Verify with backend ping
    const onlineStatus = await isOnline();
    console.log('[online-status] Backend health check result:', onlineStatus);
    callback(onlineStatus);
  };

  const handleOffline = () => {
    console.log('[online-status] Browser offline event');
    callback(false);
  };

  // Listen to browser events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Quick synchronous check using navigator.onLine only
 * Use this for immediate checks, use isOnline() for reliable checks
 */
export function isOnlineSync(): boolean {
  return navigator.onLine;
}
