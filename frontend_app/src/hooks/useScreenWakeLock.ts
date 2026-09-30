import { useEffect, useState } from "react";

type WakeLockStatus = "inactive" | "requesting" | "active" | "unavailable";

/** Keep a visible recording session awake, and recover from browser releases. */
export function useScreenWakeLock(enabled: boolean) {
  const [status, setStatus] = useState<WakeLockStatus>("inactive");

  useEffect(() => {
    if (!enabled) {
      setStatus("inactive");
      return;
    }
    if (!("wakeLock" in navigator)) {
      setStatus("unavailable");
      return;
    }

    // Each effect owns its sentinel: late requests must not leak across sessions
    // or React StrictMode's setup/cleanup cycle.
    let disposed = false;
    // Read through functions because lifecycle and visibility can change while
    // the browser's asynchronous request is pending.
    const isDisposed = () => disposed;
    const isVisible = () => document.visibilityState === "visible";
    let pending = false;
    let sentinel: WakeLockSentinel | null = null;
    const release = (lock: WakeLockSentinel) => {
      void lock.release().catch(() => {});
    };
    const onRelease = () => {
      sentinel?.removeEventListener("release", onRelease);
      sentinel = null;
      if (!isDisposed()) setStatus("unavailable");
    };

    async function request() {
      if (isDisposed() || pending || !isVisible()) return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (isDisposed() || !isVisible()) {
          release(lock);
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", onRelease);
        setStatus(lock.released ? "unavailable" : "active");
      } catch {
        if (!isDisposed()) setStatus("unavailable");
      } finally {
        pending = false;
      }
    }

    setStatus("requesting");
    void request();
    document.addEventListener("visibilitychange", request);
    document.addEventListener("pointerdown", request);
    window.addEventListener("pageshow", request);
    window.addEventListener("focus", request);
    // Retry transient refusals/releases without spinning when power saving
    // prevents acquisition. A held lock never causes another request.
    const retry = window.setInterval(request, 10_000);

    return () => {
      disposed = true;
      window.clearInterval(retry);
      document.removeEventListener("visibilitychange", request);
      document.removeEventListener("pointerdown", request);
      window.removeEventListener("pageshow", request);
      window.removeEventListener("focus", request);
      if (sentinel) {
        sentinel.removeEventListener("release", onRelease);
        release(sentinel);
      }
    };
  }, [enabled]);

  return enabled ? status : "inactive";
}
