import { SYSTEM_HEALTH_API } from "@/shared/api/constants";

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;

type OnlineStatusCallback = (isOnlineStatus: boolean) => void;

const subscribers = new Set<OnlineStatusCallback>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let checkGeneration = 0;
let isWatching = false;
let currentStatus = typeof navigator === "undefined" ? true : navigator.onLine;

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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    await fetch(SYSTEM_HEALTH_API, {
      method: "GET",
      cache: "no-cache",
      signal: controller.signal,
      credentials: "omit", // Don't send auth cookies for this check
    });

    // A response proves the backend is reachable. Do not turn an authentication
    // or application-level HTTP response into an offline state: connectivity and
    // authentication are reported separately by their respective callers.
    return true;
  } catch (error) {
    // Network error or timeout - we're offline
    console.log("[online-status] Backend not reachable:", error);
    return false;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function notify(status: boolean, force = false): void {
  if (!force && currentStatus === status) {
    return;
  }

  currentStatus = status;
  subscribers.forEach((callback) => callback(status));
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  if (
    retryTimer ||
    document.visibilityState !== "visible" ||
    !navigator.onLine
  ) {
    return;
  }

  const delay =
    RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt = Math.min(retryAttempt + 1, RETRY_DELAYS_MS.length - 1);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void revalidate();
  }, delay);
}

async function revalidate(forceNotify = false): Promise<void> {
  const generation = ++checkGeneration;

  if (!navigator.onLine) {
    clearRetry();
    retryAttempt = 0;
    notify(false, forceNotify);
    return;
  }

  if (document.visibilityState !== "visible") {
    return;
  }

  const status = await isOnline();
  if (generation !== checkGeneration || !isWatching) {
    return;
  }

  notify(status, forceNotify);
  if (status) {
    clearRetry();
    retryAttempt = 0;
  } else {
    scheduleRetry();
  }
}

function handleOnline(): void {
  console.log("[online-status] Browser online event fired");
  clearRetry();
  retryAttempt = 0;
  void revalidate(true);
}

function handleOffline(): void {
  console.log("[online-status] Browser offline event");
  checkGeneration++;
  clearRetry();
  retryAttempt = 0;
  notify(false, true);
}

function handleVisibilityChange(): void {
  if (
    document.visibilityState !== "visible" ||
    currentStatus ||
    !navigator.onLine
  ) {
    return;
  }

  // A hidden tab does not retry. On return, make one fresh bounded retry run.
  retryAttempt = 0;
  void revalidate();
}

function startWatching(): void {
  if (isWatching) {
    return;
  }

  isWatching = true;
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void revalidate();
}

function stopWatching(): void {
  if (!isWatching) {
    return;
  }

  isWatching = false;
  checkGeneration++;
  retryAttempt = 0;
  clearRetry();
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

/**
 * Watch for online/offline status changes
 * @param callback Function to call when status changes (true = online, false = offline)
 * @returns Cleanup function to remove event listeners
 */
export function watchOnlineStatus(callback: OnlineStatusCallback): () => void {
  subscribers.add(callback);
  startWatching();

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      stopWatching();
    }
  };
}

/**
 * Quick synchronous check using navigator.onLine only
 * Use this for immediate checks, use isOnline() for reliable checks
 */
export function isOnlineSync(): boolean {
  return navigator.onLine;
}
