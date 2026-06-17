/* eslint-disable @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SharedJobsPage } from "@/features/recordings/ui/SharedJobsPage";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/smart-breadcrumb", () => ({
  SmartBreadcrumb: () => <nav data-testid="breadcrumb" />,
}));

vi.mock("@/components/ui/page-heading", () => ({
  PageHeading: ({ title }: any) => <div data-testid="page-heading">{title}</div>,
}));

vi.mock("@/hooks/useBreadcrumbs", () => ({
  useBreadcrumbs: () => [],
}));

vi.mock("@/components/ui/status-badge", () => ({
  StatusBadge: () => <span data-testid="status-badge" />,
}));

vi.mock("@/components/ui/recording-card-skeleton", () => ({
  RecordingCardSkeletonGrid: () => <div data-testid="skeleton-grid" />,
}));

// Mock the motion module with inline objects to avoid hoisting issues
vi.mock("@/lib/motion", () => ({
  listContainerStagger: { id: "listContainerStagger" },
  listItemFadeInUp: { id: "listItemFadeInUp" },
}));

const capturedMotionProps: Array<any> = [];

vi.mock("framer-motion", async () => {
  const capture = (props: any) => {
    capturedMotionProps.push(props);
    return <div {...props} />;
  };

  return {
    motion: {
      div: (props: any) => capture(props),
      section: (props: any) => <section {...props} />,
    },
    AnimatePresence: ({ children, ...props }: any) => (
      <div data-testid="animate-presence" data-mode={props.mode}>
        {children}
      </div>
    ),
    useReducedMotion: () => true,
  };
});

describe("SharedJobsPage motion", () => {
  beforeEach(() => {
    capturedMotionProps.length = 0;
    mockUseQuery.mockReturnValue({
      data: {
        shared_jobs: [
          {
            id: "job-1",
            file_name: "shared.mp3",
            created_at: "2025-02-10T10:00:00Z",
            status: "completed",
            shared_by_email: "user@example.com",
            shared_with: [],
          },
        ],
        owned_jobs_shared_with_others: [
          {
            id: "job-2",
            file_name: "owned.mp3",
            created_at: "2025-02-10T11:00:00Z",
            status: "completed",
            shared_with_count: 2,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
  });

  it("renders motion container with centralized list variants import", () => {
    render(<SharedJobsPage />);

    // Check that a motion component uses listContainerStagger variants
    const hasListContainerVariants = capturedMotionProps.some(
      (props) => props.variants?.id === "listContainerStagger"
    );
    expect(hasListContainerVariants).toBe(true);
  });

  it("renders list items with listItemFadeInUp variants", () => {
    render(<SharedJobsPage />);

    // Check that list items use listItemFadeInUp variants
    const hasListItemVariants = capturedMotionProps.some(
      (props) => props.variants?.id === "listItemFadeInUp"
    );
    expect(hasListItemVariants).toBe(true);
  });

  it("uses AnimatePresence with popLayout mode for smooth transitions", () => {
    render(<SharedJobsPage />);

    expect(screen.getByTestId("animate-presence")).toHaveAttribute(
      "data-mode",
      "popLayout"
    );
  });
});
