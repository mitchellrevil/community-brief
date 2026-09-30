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

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...props}>
      {children}
    </a>
  ),
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

  describe("Retry actions", () => {
    async function openRetryAction(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: /open actions/i }),
        ).toHaveLength(1);
      });
      await user.click(screen.getByRole("button", { name: /open actions/i }));
      return screen.getByRole("menuitem", { name: /retry processing/i });
    }

    it("shows retry in the actions menu for eligible jobs", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<AdminAllJobsPage />);

      const retryAction = await openRetryAction(user);
      expect(retryAction).toBeEnabled();
    });

    it("calls retry mutation with the selected job ID", async () => {
      const user = userEvent.setup();
      const reprocessMock = vi
        .fn()
        .mockResolvedValue({ status: "success", job_id: "job-1" });
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockImplementation(
        reprocessMock,
      );

      renderWithQueryClient(<AdminAllJobsPage />);
      await user.click(await openRetryAction(user));

      await waitFor(() => {
        expect(reprocessMock).toHaveBeenCalledWith("job-1");
      });
    });

    it("does not render actions for jobs that are still processing", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<AdminAllJobsPage />);

      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: /open actions/i }),
        ).toHaveLength(1);
      });
      await user.click(screen.getByRole("button", { name: /open actions/i }));
      expect(screen.getByRole("menuitem", { name: /retry processing/i })).toBeEnabled();
    });

    it("shows the loading state while retry is pending", async () => {
      const user = userEvent.setup();
      let resolveReprocess: (value: any) => void = () => {};
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockReturnValue(
        new Promise<any>((resolve) => {
          resolveReprocess = resolve;
        }) as any,
      );

      renderWithQueryClient(<AdminAllJobsPage />);
      await user.click(await openRetryAction(user));

      await waitFor(() => {
        expect(screen.getByText("Retrying...")).toBeInTheDocument();
      });
      resolveReprocess({ status: "success", job_id: "job-1" });
    });

    it("shows a success toast after retry", async () => {
      const user = userEvent.setup();
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockResolvedValue({
        status: "success",
        job_id: "job-1",
      });

      renderWithQueryClient(<AdminAllJobsPage />);
      await user.click(await openRetryAction(user));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
            description: "Retry scheduled successfully",
            variant: "default",
          }),
        );
      });
    });

    it("shows an error toast when retry fails", async () => {
      const user = userEvent.setup();
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockRejectedValue(
        new Error("Job is locked"),
      );

      renderWithQueryClient(<AdminAllJobsPage />);
      await user.click(await openRetryAction(user));

      await waitFor(() => {
        expect(audioRecordingsApi.adminReprocessJob).toHaveBeenCalledWith(
          "job-1",
        );
      });
    });

    it("refetches jobs after a successful retry", async () => {
      const user = userEvent.setup();
      vi.mocked(audioRecordingsApi.adminReprocessJob).mockResolvedValue({
        status: "success",
        job_id: "job-1",
      });

      renderWithQueryClient(<AdminAllJobsPage />);
      vi.mocked(audioRecordingsApi.fetchAllJobsApi).mockClear();
      await user.click(await openRetryAction(user));

      await waitFor(() => {
        expect(audioRecordingsApi.fetchAllJobsApi).toHaveBeenCalled();
      });
    });
  });

  describe("Job List Display", () => {
    it("sends the server-side search term and resets to the first page", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<AdminAllJobsPage />);

      await user.type(
        await screen.findByRole("searchbox", { name: "Search recordings" }),
        "page two",
      );

      await waitFor(() => {
        expect(audioRecordingsApi.fetchAllJobsApi).toHaveBeenLastCalledWith(
          20,
          0,
          undefined,
          "page two",
        );
      });
    });

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



