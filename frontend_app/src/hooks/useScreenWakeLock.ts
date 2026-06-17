import { useEffect, useRef } from "react";

/**
 * Hook to keep the device screen awake while the component is mounted.
 *
 * Uses the Screen Wake Lock API to prevent the screen from dimming or locking
 * during important user activities like audio recording. Automatically re-acquires
 * the lock when the page becomes visible after a tab switch.
 *
 * @description Requests a screen wake lock on mount and releases it on unmount.
 * Handles visibility changes gracefully to maintain the lock across tab switches.
 * Silently fails on unsupported browsers or when permissions are denied.
 *
 * @returns {void}
 *
 * @example
 * ```tsx
 * import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
 *
 * function AudioRecordingComponent() {
 *   // Keep screen awake during recording
 *   useScreenWakeLock();
 *
 *   return (
 *     <div>
 *       <RecordingIndicator />
 *       <AudioVisualizer />
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Use in video player to prevent screen sleep
 * function VideoPlayer({ videoUrl }: { videoUrl: string }) {
 *   useScreenWakeLock();
 *
 *   return <video src={videoUrl} controls />;
 * }
 * ```
 *
 * @throws Does not throw - errors are silently caught (graceful degradation)
 */
export function useScreenWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let isActive = true;
    async function requestWakeLock() {
      try {
        // Only request wake lock if page is visible
        if ("wakeLock" in navigator && document.visibilityState === "visible") {

          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        // Silently ignore errors (page not visible, permissions denied, etc.)
        // Don't log to console as this is expected behavior
      }
    }

    requestWakeLock();

    // Re-acquire wake lock on visibility change (e.g., after tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isActive) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);
}
