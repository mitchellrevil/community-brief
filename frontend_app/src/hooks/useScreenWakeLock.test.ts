import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenWakeLock } from "./useScreenWakeLock";

function createLock() {
  const lock = new EventTarget() as WakeLockSentinel;
  Object.defineProperty(lock, "released", { value: false, writable: true });
  const release = vi.fn(async () => {
    Object.defineProperty(lock, "released", { value: true });
    lock.dispatchEvent(new Event("release"));
  });
  Object.defineProperty(lock, "release", { value: release });
  return { lock, release };
}

describe("recording screen wake lock", () => {
  const request = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true, value: { request },
    });
    request.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("acquires only for recording and releases when recording stops", async () => {
    const { lock, release } = createLock();
    request.mockResolvedValue(lock);
    const { result, rerender } = renderHook(
      ({ enabled }) => useScreenWakeLock(enabled),
      { initialProps: { enabled: false } },
    );
    expect(request).not.toHaveBeenCalled();
    await act(async () => rerender({ enabled: true }));
    expect(result.current).toBe("active");
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(request).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    expect(release).toHaveBeenCalledOnce();
    expect(result.current).toBe("inactive");
  });

  it("reports a refused request and retries without overlapping requests", async () => {
    request.mockRejectedValueOnce(new Error("Denied"));
    const { result } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(result.current).toBe("unavailable");
    request.mockResolvedValue(createLock().lock);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe("active");
  });

  it("recovers an unexpected release while the page stays visible", async () => {
    const first = createLock();
    request.mockResolvedValueOnce(first.lock).mockResolvedValue(createLock().lock);
    const { result } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    await act(async () => first.release());
    expect(result.current).toBe("unavailable");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe("active");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("waits until visible to acquire a lock", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    request.mockResolvedValue(createLock().lock);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(request).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(request).toHaveBeenCalledOnce();
  });

  it("releases a late result after stop without replacing the next session lock", async () => {
    const first = createLock();
    const second = createLock();
    let resolve!: (lock: WakeLockSentinel) => void;
    request.mockReturnValueOnce(new Promise<WakeLockSentinel>((done) => { resolve = done; }));
    request.mockResolvedValue(second.lock);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useScreenWakeLock(enabled),
      { initialProps: { enabled: true } },
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(20_000);
    });
    expect(request).toHaveBeenCalledOnce();
    rerender({ enabled: false });
    await act(async () => rerender({ enabled: true }));
    await act(async () => resolve(first.lock));
    expect(first.release).toHaveBeenCalledOnce();
    expect(second.release).not.toHaveBeenCalled();
    expect(result.current).toBe("active");
    unmount();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it("reports unsupported devices without preventing recording", () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    const { result } = renderHook(() => useScreenWakeLock(true));
    expect(result.current).toBe("unavailable");
  });
});
