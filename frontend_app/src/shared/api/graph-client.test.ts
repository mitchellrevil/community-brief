import { afterEach, describe, expect, it, vi } from "vitest";

import { MicrosoftGraphError, graphRequest } from "./graph-client";

const url = "https://graph.microsoft.com/v1.0/me/calendarView";
afterEach(() => vi.unstubAllGlobals());

describe("Microsoft Graph requests", () => {
  it("renews a rejected opaque token once and preserves request options", async () => {
    const token = vi
      .fn()
      .mockResolvedValueOnce("rejected-token")
      .mockResolvedValue("renewed-token");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await graphRequest(url, token, { signal, headers: { Accept: "text/vtt" } });
    expect(token.mock.calls).toEqual([
      [{ forceRefresh: false }],
      [{ forceRefresh: true }],
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer renewed-token",
    );
    expect(fetch.mock.calls[1][1].headers.get("Accept")).toBe("text/vtt");
    expect(fetch.mock.calls[1][1].signal).toBe(signal);
  });

  it("stops after another 401 with an actionable reconnect message", async () => {
    const token = vi.fn().mockResolvedValue("opaque-token");
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("", { status: 401 })),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(graphRequest(url, token)).rejects.toMatchObject({
      code: "GraphAuthenticationFailed",
      status: 401,
      message: expect.stringContaining("Sign in with Microsoft again"),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves consent and meeting permission failures without refreshing", async () => {
    const token = vi.fn().mockResolvedValue("opaque-token");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "Forbidden", message: "Meeting access is required" },
        }),
        { status: 403 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(graphRequest(url, token)).rejects.toMatchObject({
      code: "Forbidden",
      status: 403,
    });
    expect(token).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("never sends a token to another origin and honors cancellation", async () => {
    const token = vi.fn().mockResolvedValue("opaque-token");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      graphRequest("https://example.test/steal", token),
    ).rejects.toBeInstanceOf(MicrosoftGraphError);
    const controller = new AbortController();
    controller.abort();
    await expect(
      graphRequest(url, token, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
