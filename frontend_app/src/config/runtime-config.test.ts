import { afterEach, describe, expect, it, vi } from "vitest";

import { isTeamsRecordingsEnabled } from "./runtime-config";

describe("Teams recordings feature flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__COMMUNITY_BRIEF_CONFIG__;
  });

  it.each([undefined, "", "false", "$(VITE_ENABLE_TEAMS_RECORDINGS)"])(
    "defaults off for %s",
    (value) => {
      vi.stubEnv("VITE_ENABLE_TEAMS_RECORDINGS", value);
      expect(isTeamsRecordingsEnabled()).toBe(false);
    },
  );

  it("can be enabled for local development", () => {
    vi.stubEnv("VITE_ENABLE_TEAMS_RECORDINGS", "true");
    expect(isTeamsRecordingsEnabled()).toBe(true);
  });

  it("allows each deployment to override the shared build in either direction", () => {
    vi.stubEnv("VITE_ENABLE_TEAMS_RECORDINGS", "true");
    window.__COMMUNITY_BRIEF_CONFIG__ = { features: { teamsRecordings: false } };
    expect(isTeamsRecordingsEnabled()).toBe(false);

    vi.stubEnv("VITE_ENABLE_TEAMS_RECORDINGS", "false");
    window.__COMMUNITY_BRIEF_CONFIG__ = { features: { teamsRecordings: true } };
    expect(isTeamsRecordingsEnabled()).toBe(true);
  });
});
