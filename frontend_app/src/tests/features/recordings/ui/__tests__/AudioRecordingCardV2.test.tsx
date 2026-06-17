/**
 * AudioRecordingCardV2 component tests
 * 
 * Tests for the audio recording card component, including dropdown menu
 * behavior to ensure it doesn't cause layout shift.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { AudioRecordingCardV2 } from "@/features/recordings/ui/AudioRecordingCardV2";

// Mock TanStack Router Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// Mock EditableDisplayName to avoid complex dependencies
vi.mock("@/components/ui/editable-display-name", () => ({
  EditableDisplayName: ({ job }: { job: { displayname?: string; display_name?: string; file_name?: string; filename?: string } }) => (
    <span data-testid="display-name">{job.displayname || job.display_name || job.file_name || job.filename}</span>
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
  created_at: Date.now(),
  user_id: "user-1",
};

describe("AudioRecordingCardV2", () => {
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
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      expect(menuButton).toBeInTheDocument();
    });

    it("opens dropdown menu when trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      await user.click(menuButton);
      
      // Dropdown items should be visible
      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      });
    });

    it("dropdown menu renders in a portal (outside card container)", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div data-testid="card-container" style={{ width: "300px", overflow: "hidden" }}>
          <AudioRecordingCardV2 {...defaultProps} />
        </div>
      );
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        const menuContent = screen.getByRole("menu");
        expect(menuContent).toBeInTheDocument();
        
        // The menu should be rendered outside the card container (in a portal)
        const cardContainer = container.querySelector('[data-testid="card-container"]');
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
          <AudioRecordingCardV2 {...defaultProps} />
        </div>
      );
      
      const cardContainer = container.querySelector('[data-testid="card-container"]') as HTMLElement;
      const initialWidth = cardContainer.offsetWidth;
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });
      
      // Width should remain unchanged after dropdown opens
      expect(cardContainer.offsetWidth).toBe(initialWidth);
    });

    it("calls onViewDetails when View Details menu item is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
      });
      
      await user.click(screen.getByRole("menuitem", { name: /view details/i }));
      expect(defaultProps.onViewDetails).toHaveBeenCalledTimes(1);
    });

    it("calls onDelete when Delete menu item is clicked", async () => {
      const user = userEvent.setup();
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      const menuButton = screen.getByRole("button", { name: /open menu/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
      });
      
      await user.click(screen.getByRole("menuitem", { name: /delete/i }));
      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("Card Rendering", () => {
    it("renders recording display name", () => {
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      expect(screen.getByTestId("display-name")).toHaveTextContent("Test Recording");
    });

    it("renders status badge", () => {
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      // Status badge should show completed status
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });

    it("renders View Details button", () => {
      render(<AudioRecordingCardV2 {...defaultProps} />);
      
      expect(screen.getByRole("button", { name: /view details/i })).toBeInTheDocument();
    });
  });
});
