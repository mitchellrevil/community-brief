import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setNavigatorOnline = (online: boolean) => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
};

describe("online status monitoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    setNavigatorOnline(true);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("continues capped retries and recovers without a browser online event", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { watchOnlineStatus } = await import("@/lib/online-status");
    const callback = vi.fn();
    const cleanup = watchOnlineStatus(callback);

    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(5_000 + 15_000 + 30_000);
    expect(callback).toHaveBeenLastCalledWith(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(callback).toHaveBeenLastCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    cleanup();
  });

  it("treats an authentication response as reachable rather than offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );

    const { isOnline } = await import("@/lib/online-status");

    await expect(isOnline()).resolves.toBe(true);
  });

  it("shares one monitor and removes listeners and retries after the final unsubscribe", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    const { watchOnlineStatus } = await import("@/lib/online-status");
    const firstCleanup = watchOnlineStatus(vi.fn());
    const secondCleanup = watchOnlineStatus(vi.fn());

    await vi.advanceTimersByTimeAsync(0);
    expect(addEventListener).toHaveBeenCalledTimes(2);

    firstCleanup();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    secondCleanup();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });
});
