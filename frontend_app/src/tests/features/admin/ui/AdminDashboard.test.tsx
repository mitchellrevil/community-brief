/* eslint-disable @typescript-eslint/require-await */
/**
 * AdminDashboard Component Tests
 * 
 * Tests the admin dashboard with analytics display and loading states.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type {DashboardStats} from "@/features/admin/ui/AdminDashboard";
import { AdminDashboard  } from "@/features/admin/ui/AdminDashboard";

describe("AdminDashboard", () => {
  const mockStats: DashboardStats = {
    totalUsers: 150,
    totalRecordings: 1250,
    totalMinutes: 8500,
    activeUsers: 42,
  };

  const mockOnLoadStats = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show analytics cards with correct data", async () => {
    mockOnLoadStats.mockResolvedValue(mockStats);

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    // Wait for stats to load
    await waitFor(() => {
      expect(screen.getByTestId("stat-total-users")).toBeInTheDocument();
    });

    // Should display all stat values
    expect(screen.getByTestId("stat-total-users")).toHaveTextContent("150");
    expect(screen.getByTestId("stat-total-recordings")).toHaveTextContent("1,250");
    expect(screen.getByTestId("stat-total-minutes")).toHaveTextContent("8,500");
    expect(screen.getByTestId("stat-active-users")).toHaveTextContent("42");
  });

  it("should load data on mount", async () => {
    mockOnLoadStats.mockResolvedValue(mockStats);

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    // Should call loadStats on mount
    expect(mockOnLoadStats).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId("stats-grid")).toBeInTheDocument();
    });
  });

  it("should show loading skeletons while fetching", async () => {
    // Create a promise we can control
    let resolveStats: (stats: DashboardStats) => void;
    const statsPromise = new Promise<DashboardStats>((resolve) => {
      resolveStats = resolve;
    });
    mockOnLoadStats.mockReturnValue(statsPromise);

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    // Should show loading states
    expect(screen.getAllByTestId("stat-loading")).toHaveLength(4);

    // Resolve stats
    resolveStats!(mockStats);

    // Loading should disappear
    await waitFor(() => {
      expect(screen.queryByTestId("stat-loading")).not.toBeInTheDocument();
    });
  });

  it("should display error when load fails", async () => {
    mockOnLoadStats.mockRejectedValue(new Error("Failed to fetch analytics"));

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch analytics");
    });
  });

  it("should display custom title when provided", async () => {
    mockOnLoadStats.mockResolvedValue(mockStats);

    render(
      <AdminDashboard 
        onLoadStats={mockOnLoadStats} 
        title="System Overview"
      />
    );

    expect(screen.getByText("System Overview")).toBeInTheDocument();
  });

  it("should display loading indicator in header while loading", async () => {
    let resolveStats: (stats: DashboardStats) => void;
    const statsPromise = new Promise<DashboardStats>((resolve) => {
      resolveStats = resolve;
    });
    mockOnLoadStats.mockReturnValue(statsPromise);

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    // Should show loading text
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    // Resolve
    resolveStats!(mockStats);

    // Loading should disappear
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  it("should render all four stat cards", async () => {
    mockOnLoadStats.mockResolvedValue(mockStats);

    render(<AdminDashboard onLoadStats={mockOnLoadStats} />);

    await waitFor(() => {
      expect(screen.getByTestId("stats-grid")).toBeInTheDocument();
    });

    // Should have 4 cards
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Total Recordings")).toBeInTheDocument();
    expect(screen.getByText("Total Minutes")).toBeInTheDocument();
    expect(screen.getByText("Active Users")).toBeInTheDocument();
  });
});
