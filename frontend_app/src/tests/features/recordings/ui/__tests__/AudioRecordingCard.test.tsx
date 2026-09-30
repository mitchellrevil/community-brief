/**
 * AudioRecordingCard component tests
 *
 * Tests for the audio recording card component, including dropdown menu
 * behavior to ensure it doesn't cause layout shift.
 */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/date-utils";
import { AudioRecordingCard } from "@/features/recordings/ui/AudioRecordingCard";

// Mock TanStack Router Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock EditableDisplayName to avoid complex dependencies
vi.mock("@/components/ui/editable-display-name", () => ({
  EditableDisplayName: ({
    job,
  }: {
    job: {
      displayname?: string;
      display_name?: string;
      file_name?: string;
      filename?: string;
    };
  }) => (
    <span data-testid="display-name">
      {job.displayname || job.display_name || job.file_name || job.filename}
    </span>
  ),
}));

const mockRecording = {
  id: "rec-1",
  displayname: "Test Recording",
  display_name: "Test Recording",
  file_name: "test-audio.mp3",
  filename: "test-audio.mp3",
  file_path: "/path/to/test-audio.mp3",
  status: "completed" as const,
  audio_duration_seconds: 125,
  created_at: Date.now(),
  user_id: "user-1",
};

describe("AudioRecordingCard", () => {
  const defaultProps = {
    recording: mockRecording,
    onViewDetails: vi.fn(),
    onPlay: vi.fn(),
    onDownload: vi.fn(),
    onRetryProcessing: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dropdown Menu", () => {
    it("renders dropdown menu trigger button", () => {
      render(<AudioRecordingCard {...defaultProps} />);

      const menuButton = screen.getByRole("button", { name: /open actions/i });
      expect(menuButton).toBeInTheDocument();
    });

    it("opens dropdown menu when trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCard {...defaultProps} />);

      const menuButton = screen.getByRole("button", { name: /open actions/i });
      await user.click(menuButton);

      // Dropdown items should be visible
      await waitFor(() => {
        expect(
          screen.getByRole("menuitem", { name: /play audio/i }),
        ).toBeInTheDocument();
      });
    });

    it("dropdown menu renders in a portal (outside card container)", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div
          data-testid="card-container"
          style={{ width: "300px", overflow: "hidden" }}
        >
          <AudioRecordingCard {...defaultProps} />
        </div>,
      );

      const menuButton = screen.getByRole("button", { name: /open actions/i });
      await user.click(menuButton);

      await waitFor(() => {
        const menuContent = screen.getByRole("menu");
        expect(menuContent).toBeInTheDocument();

        // The menu should be rendered outside the card container (in a portal)
        const cardContainer = container.querySelector(
          '[data-testid="card-container"]',
        );
        expect(cardContainer?.contains(menuContent)).toBe(false);
      });
    });

    it("opening dropdown does not change card container dimensions", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div
          data-testid="card-container"
          style={{ width: "300px", display: "inline-block" }}
        >
          <AudioRecordingCard {...defaultProps} />
        </div>,
      );

      const cardContainer = container.querySelector(
        '[data-testid="card-container"]',
      ) as HTMLElement;
      const initialWidth = cardContainer.offsetWidth;

      const menuButton = screen.getByRole("button", { name: /open actions/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });

      // Width should remain unchanged after dropdown opens
      expect(cardContainer.offsetWidth).toBe(initialWidth);
    });

    it("calls onViewDetails when Open is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCard {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /^open$/i }));
      expect(defaultProps.onViewDetails).toHaveBeenCalledTimes(1);
    });

    it("calls onDelete when Delete menu item is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCard {...defaultProps} />);

      const menuButton = screen.getByRole("button", { name: /open actions/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(
          screen.getByRole("menuitem", { name: /delete/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("menuitem", { name: /delete/i }));
      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("Card Rendering", () => {
    it("renders recording display name", () => {
      render(<AudioRecordingCard {...defaultProps} />);

      expect(screen.getByTestId("display-name")).toHaveTextContent(
        "Test Recording",
      );
    });

    it("renders status badge", () => {
      render(<AudioRecordingCard {...defaultProps} />);

      // Status badge should show completed status
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });

    it("shows a spinning indicator while transcribing", () => {
      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{ ...mockRecording, status: "transcribing" }}
        />,
      );

      const statusBadge = screen.getByRole("status", {
        name: "Status: transcribing",
      });

      expect(statusBadge.querySelector("svg")).toHaveClass("animate-spin");
    });

    it("renders Open button", () => {
      render(<AudioRecordingCard {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /^open$/i }),
      ).toBeInTheDocument();
    });

    it("renders the recording length before the title", () => {
      render(<AudioRecordingCard {...defaultProps} />);

      expect(screen.getByLabelText("Recording length 2:05")).toBeInTheDocument();
      expect(screen.getByTestId("display-name")).toHaveTextContent(
        "Test Recording",
      );
    });

    it("renders exact Created and Updated timestamps", () => {
      const createdAt = "2026-08-14T16:47:00Z";
      const updatedAt = "2026-08-14T16:49:00Z";

      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{ ...mockRecording, created_at: createdAt, updated_at: updatedAt }}
        />,
      );

      expect(screen.getByText("Created:")).toBeInTheDocument();
      expect(screen.getByText(formatDateTime(createdAt))).toBeInTheDocument();
      expect(screen.getByText("Updated:")).toBeInTheDocument();
      expect(screen.getByText(formatDateTime(updatedAt))).toBeInTheDocument();
    });

    it("shows the record's remaining Cosmos TTL with its exact expiry", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));

      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{
            ...mockRecording,
            created_at: "2026-08-27T12:00:00Z",
            _ts: Date.parse("2026-08-27T00:00:00Z") / 1000,
            ttl: 2 * 24 * 60 * 60,
          }}
        />,
      );

      expect(screen.getByText("2 days")).toBeInTheDocument();
      expect(
        screen.getByLabelText(/expires in 2 days.*Aug 29, 2026/i),
      ).toHaveAttribute("title", expect.stringMatching(/Aug 29, 2026/i));
      vi.useRealTimers();
    });

    it("shows expiry only when less than 15 days remain", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
      const updatedAt = Date.parse("2026-08-27T12:00:00Z") / 1000;

      const { rerender } = render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{
            ...mockRecording,
            _ts: updatedAt,
            ttl: 15 * 24 * 60 * 60,
          }}
        />,
      );

      expect(screen.queryByText("Expires:")).not.toBeInTheDocument();

      rerender(
        <AudioRecordingCard
          {...defaultProps}
          recording={{
            ...mockRecording,
            _ts: updatedAt,
            ttl: 15 * 24 * 60 * 60 - 1,
          }}
        />,
      );

      expect(screen.getByText("Expires:")).toBeInTheDocument();
      expect(screen.getByText("15 days").parentElement?.parentElement).toHaveClass(
        "text-orange-700",
      );
      vi.useRealTimers();
    });

    it("renders the expiry indicator beside the filename when a display name is set", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));

      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{
            ...mockRecording,
            _ts: Date.parse("2026-08-27T00:00:00Z") / 1000,
            ttl: 2 * 24 * 60 * 60,
          }}
        />,
      );

      const filename = screen.getByText("test-audio.mp3");
      const expiry = screen.getByText("2 days");

      expect(filename.parentElement).toContainElement(expiry);
      vi.useRealTimers();
    });

    it("renders the expiry indicator underneath the filename when no display name is set", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));

      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{
            ...mockRecording,
            displayname: undefined,
            display_name: undefined,
            _ts: Date.parse("2026-08-27T00:00:00Z") / 1000,
            ttl: 2 * 24 * 60 * 60,
          }}
        />,
      );

      const displayName = screen.getByTestId("display-name");
      const expiry = screen.getByText("2 days");

      expect(displayName.parentElement?.parentElement).toContainElement(expiry);
      expect(displayName.parentElement).not.toContainElement(expiry);
      vi.useRealTimers();
    });

    it("omits expiry when the Cosmos TTL is disabled", () => {
      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{ ...mockRecording, _ts: 1_788_000_000, ttl: -1 }}
        />,
      );

      expect(screen.queryByText("Expires:")).not.toBeInTheDocument();
    });

    it("omits Updated when it predates Created", () => {
      const createdAt = "2026-08-14T16:49:00Z";
      const updatedAt = "2026-08-14T16:47:00Z";

      render(
        <AudioRecordingCard
          {...defaultProps}
          recording={{ ...mockRecording, created_at: createdAt, updated_at: updatedAt }}
        />,
      );

      expect(screen.getByText(formatDateTime(createdAt))).toBeInTheDocument();
      expect(screen.queryByText("Updated:")).not.toBeInTheDocument();
      expect(screen.queryByText(formatDateTime(updatedAt))).not.toBeInTheDocument();
    });
  });
});
