/* eslint-disable @typescript-eslint/require-await */
/**
 * RecordingHeader Component Tests
 *
 * Tests for the RecordingHeader component including the
 * TranscriptionStatusPopover integration.
 */
import { RecordingHeader } from "@/features/recordings/ui/RecordingDetails/RecordingHeader";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/page-heading", () => ({
  PageHeading: ({ title, breadcrumb, actions, ...props }: any) => (
    <div data-testid="page-heading" {...props}>
      <div data-testid="heading-title">{title}</div>
      <div data-testid="heading-breadcrumb">{breadcrumb}</div>
      <div data-testid="heading-actions">{actions}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/smart-breadcrumb", () => ({
  SmartBreadcrumb: () => <div data-testid="smart-breadcrumb" />,
}));

vi.mock("@/components/ui/status-badge", () => ({
  StatusBadge: ({ status }: any) => (
    <div data-testid="status-badge">{status}</div>
  ),
}));

vi.mock("@/components/ui/editable-display-name", () => ({
  EditableDisplayName: ({ job }: any) => (
    <span data-testid="editable-display-name">
      {job.display_name || "Recording"}
    </span>
  ),
}));

// Create a mock recording
const mockRecording = {
  id: "job-123",
  user_id: "user-456",
  file_path: "https://example.com/audio.mp3",
  transcription_file_path: null,
  analysis_file_path: null,
  status: "transcribed",
  prompt_category_id: "cat-1",
  prompt_subcategory_id: "sub-1",
  created_at: Date.now(),
  updated_at: Date.now(),
  display_name: "Test Recording",
  type: "audio",
  _rid: "",
  _self: "",
  _etag: "",
  _attachments: "",
  _ts: 0,
};

describe("RecordingHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("basic rendering", () => {
    it("should render recording title", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
        />,
      );

      expect(screen.getByTestId("editable-display-name")).toHaveTextContent(
        "Test Recording",
      );
    });

    it("should render status badge", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
        />,
      );

      expect(screen.getByTestId("status-badge")).toBeInTheDocument();
    });

    it("should render navigation back button", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
        />,
      );

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/audio-recordings",
      );
    });

    it("should link back to shared files when opened from shared jobs", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          backTo="/audio-recordings/shared"
        />,
      );

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/audio-recordings/shared",
      );
    });

    it("should link back to all files when opened from all files", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          backTo="/admin/all-jobs"
        />,
      );

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/admin/all-jobs",
      );
    });
  });

  describe("popover integration", () => {
    it("should render TranscriptionStatusPopover when showTranscriptionPopover is true", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          showTranscriptionPopover={true}
          onDismissTranscriptionPopover={vi.fn()}
        />,
      );

      // Popover content should be visible
      expect(
        screen.getByText(/your audio is being processed/i),
      ).toBeInTheDocument();
    });

    it("should not render popover content when showTranscriptionPopover is false", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          showTranscriptionPopover={false}
          onDismissTranscriptionPopover={vi.fn()}
        />,
      );

      // Popover content should not be visible
      expect(
        screen.queryByText(/your audio is being processed/i),
      ).not.toBeInTheDocument();
    });

    it("should call onDismissTranscriptionPopover when popover is dismissed", async () => {
      vi.useRealTimers(); // Use real timers for user interaction
      const user = userEvent.setup();
      const onDismiss = vi.fn();

      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          showTranscriptionPopover={true}
          onDismissTranscriptionPopover={onDismiss}
        />,
      );

      // Find and click the dismiss button in the popover
      const dismissButton = screen.getByRole("button", {
        name: /dismiss|close/i,
      });
      await user.click(dismissButton);

      expect(onDismiss).toHaveBeenCalled();
      vi.useFakeTimers(); // Restore fake timers
    });

    it("should call onDismissTranscriptionPopover when popover auto-dismisses", async () => {
      const onDismiss = vi.fn();

      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          showTranscriptionPopover={true}
          onDismissTranscriptionPopover={onDismiss}
        />,
      );

      // Fast-forward 60 seconds for auto-dismiss
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      expect(onDismiss).toHaveBeenCalled();
    });

    it("should still render StatusBadge when popover props are not provided", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
        />,
      );

      // StatusBadge should be visible regardless of popover state
      expect(screen.getByTestId("status-badge")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it('should have accessible popover content with role="alert"', () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={false}
          showTranscriptionPopover={true}
          onDismissTranscriptionPopover={vi.fn()}
        />,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("responsive behavior", () => {
    it("should adapt layout for tiny screens", () => {
      render(
        <RecordingHeader
          recording={mockRecording as any}
          isTinyScreen={true}
        />,
      );

      // Component should render without errors on tiny screens
      expect(screen.getByTestId("page-heading")).toBeInTheDocument();
    });
  });
});
