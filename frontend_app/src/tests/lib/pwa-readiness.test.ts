import { afterEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_STARTUP_TIMEOUT_MS, waitForOfflineStartup } from "@/lib/pwa-readiness";

describe("waitForOfflineStartup", () => {
  afterEach(() => vi.useRealTimers());

  it("returns only an active service-worker registration", async () => {
    const registration = { active: { state: "activated" } } as unknown as ServiceWorkerRegistration;
    await expect(waitForOfflineStartup({ ready: Promise.resolve(registration) } as ServiceWorkerContainer)).resolves.toBe(registration);
  });

  it("rejects when an inactive registration resolves", async () => {
    const registration = { active: null } as unknown as ServiceWorkerRegistration;
    await expect(waitForOfflineStartup({ ready: Promise.resolve(registration) } as ServiceWorkerContainer)).rejects.toThrow("not active");
  });

  it("does not leave offline preparation pending when no worker activates", async () => {
    vi.useFakeTimers();
    const result = waitForOfflineStartup({ ready: new Promise<ServiceWorkerRegistration>(() => {}) } as ServiceWorkerContainer);
    const rejection = expect(result).rejects.toThrow("did not become ready");

    await vi.advanceTimersByTimeAsync(OFFLINE_STARTUP_TIMEOUT_MS);

    await rejection;
  });
});
