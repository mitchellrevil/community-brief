import { describe, expect, it } from "vitest";
import { analyticsKeys } from "@/features/analytics/data/keys";
import { announcementKeys } from "@/features/announcements/data/keys";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { templatesKeys } from "@/shared/data/templates";

describe("Query Key Factories", () => {
  it("scopes prompt catalog keys by view, item, and pagination", () => {
    expect(templatesKeys.versions("template-1")).toEqual([
      "community-brief",
      "templates",
      "templates",
      "management",
      "item",
      "template-1",
      "versions",
      { limit: 25, offset: 0 },
    ]);

    expect(
      templatesKeys.versionDiff("template-1", "left-v", "right-v"),
    ).toEqual([
      "community-brief",
      "templates",
      "templates",
      "management",
      "item",
      "template-1",
      "versions",
      "compare",
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

    expect(announcementKeys.adminRoot()).toEqual(["announcements", "admin"]);
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
