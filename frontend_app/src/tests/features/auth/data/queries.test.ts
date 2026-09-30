import { describe, expect, it } from "vitest";

import { shouldRetryAuthSession } from "@/features/auth/data/queries";
import { ApiError } from "@/lib/errors/ApiError";
import { NetworkError } from "@/lib/errors/NetworkError";

describe("auth session retries", () => {
  it("retries transient network failures twice", () => {
    const error = new NetworkError("Network request failed");
    expect(shouldRetryAuthSession(1, error)).toBe(true);
    expect(shouldRetryAuthSession(2, error)).toBe(false);
  });

  it("does not retry offline or rejected sessions", () => {
    expect(shouldRetryAuthSession(1, new NetworkError("Offline", { isOffline: true }))).toBe(false);
    expect(shouldRetryAuthSession(1, new ApiError("Unauthorized", { status: 401 }))).toBe(false);
    expect(shouldRetryAuthSession(1, new ApiError("Forbidden", { status: 403 }))).toBe(false);
  });

  it("retries temporary server failures but not permanent responses", () => {
    expect(shouldRetryAuthSession(1, new ApiError("Unavailable", { status: 503 }))).toBe(true);
    expect(shouldRetryAuthSession(1, new ApiError("Bad request", { status: 400 }))).toBe(false);
  });
});
