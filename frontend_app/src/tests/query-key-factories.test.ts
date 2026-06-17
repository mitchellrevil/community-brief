import { describe, expect, it } from "vitest";

import { announcementKeys } from "@/features/announcements/data/keys";
import { analyticsKeys } from "@/features/analytics/data/keys";
import { promptManagementKeys } from "@/features/prompt-management/data/keys";
import { recordingsKeys } from "@/features/recordings/data/keys";

describe("Query Key Factories", () => {
  it("builds prompt-management versions keys from the prompt namespace", () => {
    expect(promptManagementKeys.versions("sub-1")).toEqual([
      "community-brief",
      "prompt-management",
      "versions",
      "sub-1",
    ]);

    expect(
      promptManagementKeys.versionsDiff("sub-1", "left-v", "right-v")
    ).toEqual([
      "community-brief",
      "prompt-management",
      "versions-diff",
      "sub-1",
      "left-v",
      "right-v",
    ]);
  });

  it("centralizes announcements admin table keys", () => {
    expect(announcementKeys.adminTable(50, 0, "all", "critical")).toEqual([
      "announcements",
      "admin",
      "table",
      50,
      0,
      "all",
      "critical",
    ]);

    expect(announcementKeys.adminRoot()).toEqual([
      "announcements",
      "admin",
    ]);
  });

  it("provides analytics system key namespace", () => {
    expect(analyticsKeys.systemRoot()).toEqual(["system-analytics"]);
    expect(analyticsKeys.system(30, "bu-1")).toEqual([
      "system-analytics",
      30,
      "bu-1",
    ]);
  });

  it("provides recordings analysis refinement key factories", () => {
    expect(recordingsKeys.analysisHistory("job-1")).toEqual([
      "community-brief",
      "analysis-refinement",
      "history",
      "job-1",
    ]);

    expect(recordingsKeys.analysisSuggestions("job-1")).toEqual([
      "community-brief",
      "analysis-refinement",
      "suggestions",
      "job-1",
    ]);
  });
});
