import { describe, expect, it } from "vitest";
import type { SystemAnalytics } from "@/types/api";
import { buildAnalyticsInsights } from "@/features/analytics/ui/analytics-insights";

describe("buildAnalyticsInsights", () => {
  it("derives top and lower ranked users from scoped analytics", () => {
    const analytics: SystemAnalytics = {
      period_days: 30,
      start_date: "2026-02-01T00:00:00Z",
      end_date: "2026-03-01T00:00:00Z",
      analytics: {
        records: [
          {
            id: "record-1",
            user_id: "u-1",
            email: "alex@example.org",
            timestamp: "2026-02-15T09:00:00Z",
            audio_duration_minutes: 20,
            file_name: "review.wav",
            prompt_category_id: "childrens-services",
          },
          {
            id: "record-2",
            user_id: "u-2",
            email: "bella@example.org",
            timestamp: "2026-02-16T11:00:00Z",
            audio_duration_minutes: 5,
            file_name: "handover.wav",
            prompt_category_id: "childrens-services",
          },
        ],
        users: [
          {
            user_id: "u-1",
            email: "alex@example.org",
            total_jobs: 6,
            total_minutes: 52,
          },
          {
            user_id: "u-2",
            email: "bella@example.org",
            total_jobs: 2,
            total_minutes: 8,
          },
        ],
        total_minutes: 60,
        total_jobs: 8,
        total_users: 4,
        overview: {
          total_users: 4,
          active_users: 2,
          total_jobs: 8,
          total_transcription_minutes: 60,
          peak_active_users: 2,
        },
        trends: {
          daily_activity: {
            "2026-02-15": 5,
            "2026-02-16": 3,
          },
          daily_transcription_minutes: {},
          daily_active_users: {},
          user_growth: {},
          job_completion_rate: 100,
        },
        usage: {
          transcription_methods: { upload: 8 },
          file_vs_text_ratio: { files: 8, text: 0 },
          peak_hours: { "09": 6, "11": 2 },
        },
      },
    };

    const insights = buildAnalyticsInsights(analytics);

    expect(insights.topUsers[0]?.email).toBe("alex@example.org");
    expect(insights.lowerUsers[0]?.email).toBe("bella@example.org");
    expect(insights.coverage.trackedUsers).toBe(2);
    expect(insights.coverage.knownUsers).toBe(4);
    expect(insights.coverage.note).toContain("Only 2 of 4 users");
    expect(insights.peakHour?.hour).toBe("09");
  });

  it("falls back to raw records when aggregate users are missing", () => {
    const analytics: SystemAnalytics = {
      period_days: 7,
      start_date: "2026-03-01T00:00:00Z",
      end_date: "2026-03-07T00:00:00Z",
      analytics: {
        records: [
          {
            id: "record-1",
            user_id: "u-3",
            timestamp: "2026-03-03T08:30:00Z",
            audio_duration_minutes: 12.5,
            email: "case.worker@example.org",
          },
          {
            id: "record-2",
            user_id: "u-3",
            timestamp: "2026-03-04T10:30:00Z",
            audio_duration_minutes: 7.5,
            email: "case.worker@example.org",
          },
        ],
        total_minutes: 20,
        total_jobs: 2,
      },
    };

    const insights = buildAnalyticsInsights(analytics);

    expect(insights.rankedUsers).toHaveLength(1);
    expect(insights.rankedUsers[0]?.totalJobs).toBe(2);
    expect(insights.rankedUsers[0]?.totalMinutes).toBe(20);
    expect(insights.rankedUsers[0]?.activeDays).toBe(2);
  });
});