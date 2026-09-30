import { describe, expect, it } from "vitest";

describe("InferenceSettings source contract", () => {
  it("uses Community Brief in the suggested recording disclaimer copy", async () => {
    const source = await import("@/config/recordingDisclaimer?raw").then(
      (module) => module.default,
    );

    expect(source).toContain("I am using Community Brief tool to record");
    expect(source).not.toContain("Minute AI");
  });
});
