import { describe, expect, it } from "vitest";

describe("PromptEditor source contract", () => {
  it("keeps document tabs and saves markdown content", async () => {
    const source =
      await import("@/features/prompt-management/ui/editor?raw").then(
        (module) => module.default,
      );

    expect(source).toContain('value="edit"');
    expect(source).toMatch(/>\s*Edit\s*</);
    expect(source).toContain('value="forms"');
    expect(source).toMatch(/>\s*Forms\s*</);
    expect(source).toContain('value="versions"');
    expect(source).toMatch(/>\s*Versions\s*</);
    expect(source).not.toContain('value="visibility"');
    expect(source).toContain("Save and Publish");
    expect(source).not.toMatch(/>\s*Publish\s*</);
    expect(source).toContain("{ [promptName]: promptContent }");
    expect(source).toContain("<EditableDisplayName");
    expect(source).toContain("recording_disclaimer_enabled");
    expect(source).toContain("recording_disclaimer");
    expect(source).toContain(
      "inferenceSettings.recording_disclaimer?.trim() || null",
    );
  });
});

describe("VersionsControl source contract", () => {
  it("keeps the compare modal and uses clearer version history labels", async () => {
    const source =
      await import("@/features/prompt-management/ui/versions-control?raw").then(
        (module) => module.default,
      );

    expect(source).toContain("<Dialog");
    expect(source).toContain("Open Version History");
    expect(source).toContain("Version History");
    expect(source).toContain("Compare from");
    expect(source).toContain("Compare to");
    expect(source).toContain("Changed areas");
    expect(source).toContain("Template");
    expect(source).toContain("Visibility");
    expect(source).toContain("Inference");
    expect(source).toContain("Pre-session");
    expect(source).toContain("In-session");
    expect(source).toContain("Restore this version");
    expect(source).not.toContain("Restore Left");
    expect(source).not.toContain("Version Control");
  });
});
