import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnalyticsDashboard } from "@/features/analytics/ui/AnalyticsDashboard";

const mockUseAnalyticsData = vi.fn();

vi.mock("@/features/analytics/ui/hooks/useAnalyticsData", () => ({
  useAnalyticsData: () => mockUseAnalyticsData(),
}));

vi.mock("@/hooks/useBreadcrumbs", () => ({
  useBreadcrumbs: () => [],
}));

vi.mock("@/features/analytics/data/api", () => ({
  exportPromptAnalyticsCSV: vi.fn(),
  exportSystemAnalyticsCSV: vi.fn(),
}));

vi.mock("@/features/analytics/ui/AddUserToBusinessUnitDialog", () => ({
  AddUserToBusinessUnitDialog: () => <div>Add User Dialog</div>,
}));

vi.mock("@/features/analytics/ui/AnalyticsChart", () => ({
  AnalyticsChart: () => <div>Analytics Chart</div>,
}));

vi.mock("@/features/analytics/ui/RecentJobsCard", () => ({
  RecentJobsCard: () => <div>Recent Jobs Card</div>,
}));

vi.mock("@/features/analytics/ui/SessionsDashboard", () => ({
  SessionsDashboard: () => <div>Sessions Dashboard</div>,
}));

vi.mock("@/features/analytics/ui/UserAdoptionBoard", () => ({
  UserAdoptionBoard: () => <div>User Adoption Board</div>,
}));

vi.mock("@/features/analytics/ui/PromptLeaderboard", () => ({
  PromptLeaderboard: () => <div>Prompt Leaderboard</div>,
}));

vi.mock("@/features/analytics/ui/analytics-insights", () => ({
  buildAnalyticsInsights: () => ({
    coverage: { trackedUsers: 12 },
  }),
}));

describe("AnalyticsDashboard", () => {
  beforeEach(() => {
    mockUseAnalyticsData.mockReset();
  });

  it("shows non-session analytics tabs to editors while hiding session analytics", () => {
    mockUseAnalyticsData.mockReturnValue({
      analyticsPeriod: 30,
      setAnalyticsPeriod: vi.fn(),
      selectedBusinessUnit: null,
      setSelectedBusinessUnit: vi.fn(),
      businessUnits: [],
      systemAnalytics: {
        start_date: "2026-03-01",
        end_date: "2026-03-15",
        analytics: {
          total_jobs: 42,
          total_minutes: 90,
          recent_jobs: [],
          trends: {
            daily_activity: { "2026-03-14": 10 },
          },
        },
      },
      analyticsLoading: false,
      isAdmin: false,
      isEditor: true,
      editorBusinessUnitIds: ["bu-1"],
      effectiveBusinessUnitId: null,
      analyticsData: [],
    });

    render(<AnalyticsDashboard />);

    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^jobs$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prompts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^recent$/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /sessions/i })).toBeNull();
  });
});