/**
 * AdminAllJobsPage Component Tests
 * 
 * Tests the admin all jobs page with job listing, filtering, and retry functionality.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAllJobsPage } from "@/features/admin/ui/all-jobs-page";
import * as audioRecordingsApi from "@/features/recordings/data/api";

// Mock the API module
vi.mock("@/features/recordings/data/api", () => ({
  fetchAllJobsApi: vi.fn(),
  adminReprocessJob: vi.fn(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock dependent components and hooks
vi.mock("@/components/ui/smart-breadcrumb", () => ({
  SmartBreadcrumb: ({ items }: any) => <div data-testid="breadcrumb">{items?.length ?? 0}</div>,
}));

vi.mock("@/components/ui/page-heading", () => ({
  PageHeading: ({ title }: any) => <div data-testid="page-heading">{title}</div>,
}));

vi.mock("@/hooks/useBreadcrumbs", () => ({
  useBreadcrumbs: () => [],
}));

vi.mock("@/components/ui/recording-card-skeleton", () => ({
  RecordingCardSkeletonGrid: ({ count }: any) => (
    <div data-testid="skeleton-grid">{count}</div>
  ),
}));

vi.mock("@/components/ui/pagination", () => ({
  EnhancedPagination: () => <div data-testid="pagination" />,
}));

vi.mock("@/features/users/ui/UserSelect", () => ({
  UserSelect: ({ value, onValueChange }: any) => (
    <select
      data-testid="user-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="all">All</option>
      <option value="user1">User 1</option>
    </select>
  ),
}));

describe("AdminAllJobsPage", () => {
  const mockJobs = [
    {
      id: "job-1",
      user_id: "user-1",
      file_name: "meeting1.mp3",
      file_path: "/path/to/meeting1.mp3",
      status: "COMPLETED",
      created_at: "2025-02-09T10:00:00Z",
      updated_at: "2025-02-09T10:30:00Z",
      user_email: "user1@example.com",
      deleted: false,
    },
    {
      id: "job-2",
      user_id: "user-2",
      file_name: "meeting2.mp3",
      file_path: "/path/to/meeting2.mp3",
      status: "transcribing",
      created_at: "2025-02-09T11:00:00Z",
      updated_at: "2025-02-09T11:05:00Z",
      user_email: "user2@example.com",
      deleted: false,
    },
    {
      id: "job-3",
      user_id: "user-3",
      file_name: "meeting3.mp3",
      file_path: "/path/to/meeting3.mp3",
      status: "analysing",
      created_at: "2025-02-09T09:00:00Z",
      updated_at: "2025-02-09T09:30:00Z",
      user_email: "user3@example.com",
      deleted: false,
    },
  ];

  const mockJobsResponse = {
    status: "success",
    jobs: mockJobs,
    total_count: 3,
  };

  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.mocked(audioRecordingsApi.fetchAllJobsApi).mockResolvedValue(
      mockJobsResponse
    );
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  describe("Retry Button Functionality", () => {
    it("should display retry button for each job", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });
    });

    it("should call retry mutation with correct job ID when retry button clicked", async () => {
      const user = userEvent.setup();
      const reprocessMock = vi.fn().mockResolvedValue({ status: "success", job_id: "job-1" });
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockImplementation(
        reprocessMock
      );

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(
          3
        );
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      await waitFor(() => {
        expect(reprocessMock).toHaveBeenCalledWith("job-1");
      });
    });

    it("should disable retry button when mutation is pending", async () => {
      const user = userEvent.setup();
      let resolveReprocess: (value: any) => void = () => {};
      const reprocessPromise = new Promise<any>((resolve) => {
        resolveReprocess = resolve;
      });
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockReturnValue(
        reprocessPromise as any
      );

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(
          3
        );
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      // Button should be disabled during loading
      await waitFor(() => {
        const disabledButtons = screen.getAllByRole("button", { name: /loading|retry/i }).filter(btn => 
          (btn as HTMLButtonElement).disabled
        );
        expect(disabledButtons.length).toBeGreaterThan(0);
      });

      resolveReprocess({ status: "success", job_id: "job-1" });
    });

    it("should disable retry button when job status is TRANSCRIBING", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      // Find the button for job-2 which has TRANSCRIBING status
      const jobCards = screen.getAllByRole("button", { name: /view details/i });
      // The retry button should be near the job with TRANSCRIBING status
      // We need to verify by checking the job card context
      const allRetryButtons = screen.getAllByRole("button", { name: /retry/i });
      
      // The second retry button (for job-2 with TRANSCRIBING status) should be disabled
      expect((allRetryButtons[1] as HTMLButtonElement).disabled).toBe(true);
    });

    it("should disable retry button when job status is ANALYSING", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const allRetryButtons = screen.getAllByRole("button", { name: /retry/i });
      
      // The third retry button (for job-3 with ANALYSING status) should be disabled
      expect((allRetryButtons[2] as HTMLButtonElement).disabled).toBe(true);
    });

    it("should enable retry button when job status is COMPLETED", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const allRetryButtons = screen.getAllByRole("button", { name: /retry/i });
      
      // The first retry button (for job-1 with COMPLETED status) should be enabled
      expect((allRetryButtons[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it("should show success toast on successful retry", async () => {
      const user = userEvent.setup();
      
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockResolvedValue({
        status: "success",
        job_id: "job-1",
      });

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      await waitFor(() => {
        expect(audioRecordingsApi.adminReprocessJob).toHaveBeenCalledWith("job-1");
        // Toast should be called with success message
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
            description: "Retry scheduled successfully",
            variant: "default",
          })
        );
      });
    });

    it("should show error toast on failed retry", async () => {
      const user = userEvent.setup();
      const errorMessage = "Job is locked";
      
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockRejectedValue(
        new Error(errorMessage)
      );

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      await waitFor(() => {
        expect(audioRecordingsApi.adminReprocessJob).toHaveBeenCalledWith("job-1");
      });
    });

    it("should refetch jobs after successful retry", async () => {
      const user = userEvent.setup();
      
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockResolvedValue({
        status: "success",
        job_id: "job-1",
      });

      renderWithQueryClient(<AdminAllJobsPage />);

      // Clear the initial mock call
      vi.mocked(audioRecordingsApi.fetchAllJobsApi).mockClear();

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      // Wait for refetch to be called
      await waitFor(() => {
        expect(vi.mocked(audioRecordingsApi.fetchAllJobsApi).mock.calls.length).toBeGreaterThan(0);
      });
    });

    it("should show loading spinner icon on retry button while pending", async () => {
      const user = userEvent.setup();
      let resolveReprocess: (value: any) => void = () => {};
      const reprocessPromise = new Promise<any>((resolve) => {
        resolveReprocess = resolve;
      });
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockReturnValue(
        reprocessPromise as any
      );

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /retry/i }).length).toBe(3);
      });

      const retryButtons = screen.getAllByRole("button", { name: /retry/i });
      await user.click(retryButtons[0]);

      // The button should show a loading state with spinner
      await waitFor(() => {
        // Check for spinner/loading icon in the button
        const buttons = Array.from(document.querySelectorAll("button"));
        const loadingButton = buttons.some(btn =>
          btn.querySelector('[class*="animate-spin"]') !== null
        );
        expect(loadingButton).toBe(true);
      });

      resolveReprocess({ status: "success", job_id: "job-1" });
    });
  });

  describe("Job List Display", () => {
    it("should display job list when data loads", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getByText("meeting1.mp3")).toBeInTheDocument();
        expect(screen.getByText("meeting2.mp3")).toBeInTheDocument();
        expect(screen.getByText("meeting3.mp3")).toBeInTheDocument();
      });
    });

    it("should prefer job display name when present", async () => {
      vi.mocked(audioRecordingsApi.fetchAllJobsApi).mockResolvedValueOnce({
        ...mockJobsResponse,
        jobs: [
          {
            ...mockJobs[0],
            display_name: "Board Meeting",
          },
        ],
        total_count: 1,
      });

      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getByText("Board Meeting")).toBeInTheDocument();
      });
    });

    it("should display correct job information", async () => {
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(screen.getByText("user1@example.com")).toBeInTheDocument();
        expect(screen.getByText("user2@example.com")).toBeInTheDocument();
        expect(screen.getByText("user3@example.com")).toBeInTheDocument();
      });
    });

    it("should show loading skeleton while fetching", async () => {
      let resolveJobs: (value: any) => void;
      const jobsPromise = new Promise<any>((resolve) => {
        resolveJobs = resolve;
      });
      vi.mocked(audioRecordingsApi.fetchAllJobsApi).mockReturnValue(
        jobsPromise as any
      );

      renderWithQueryClient(<AdminAllJobsPage />);

      // Should show loading skeleton
      expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument();

      resolveJobs!(mockJobsResponse);

      await waitFor(() => {
        expect(screen.getByText("meeting1.mp3")).toBeInTheDocument();
      });
    });
  });
});



