/* eslint-disable @typescript-eslint/require-await */
/**
 * TranscriptionStatusPopover Component Tests
 *
 * Tests for the auto-dismissing popover that notifies users their audio
 * is processing and they can safely leave the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranscriptionStatusPopover } from '@/features/recordings/ui/RecordingDetails/TranscriptionStatusPopover';

describe('TranscriptionStatusPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render popover content when open is true', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      expect(
        screen.getByText(/your audio is being processed/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/you can safely leave this page/i)
      ).toBeInTheDocument();
    });

    it('should render a dismiss button', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      expect(
        screen.getByRole('button', { name: /dismiss|close/i })
      ).toBeInTheDocument();
    });

    it('should render the check/success icon', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      // Check for the icon by test-id or SVG presence
      expect(screen.getByTestId('success-icon')).toBeInTheDocument();
    });

    it('should have accessibility role="alert"', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-describedby for accessibility', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-describedby');
    });
  });

  describe('dismiss functionality', () => {
    it('should call onOpenChange(false) when dismiss button is clicked', async () => {
      // Use real timers for user interaction tests
      vi.useRealTimers();
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <TranscriptionStatusPopover open={true} onOpenChange={onOpenChange} />
      );

      const dismissButton = screen.getByRole('button', { name: /dismiss|close/i });
      await user.click(dismissButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe('auto-dismiss timer', () => {
    it('should auto-dismiss after default timeout (60 seconds)', async () => {
      const onOpenChange = vi.fn();

      render(
        <TranscriptionStatusPopover open={true} onOpenChange={onOpenChange} />
      );

      // Fast-forward 59 seconds - should not have called yet
      act(() => {
        vi.advanceTimersByTime(59000);
      });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Fast-forward 1 more second (60 total)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should respect custom autoDismissMs prop', async () => {
      const onOpenChange = vi.fn();

      render(
        <TranscriptionStatusPopover
          open={true}
          onOpenChange={onOpenChange}
          autoDismissMs={5000}
        />
      );

      // Fast-forward 4 seconds - should not have called yet
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Fast-forward 1 more second (5 total)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not start timer if open is false', () => {
      const onOpenChange = vi.fn();

      render(
        <TranscriptionStatusPopover open={false} onOpenChange={onOpenChange} />
      );

      // Fast-forward past auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(120000);
      });
      
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('should clear timer on unmount', () => {
      const onOpenChange = vi.fn();

      const { unmount } = render(
        <TranscriptionStatusPopover open={true} onOpenChange={onOpenChange} />
      );

      // Unmount before timer fires
      unmount();

      // Fast-forward past auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(120000);
      });

      // Should not have been called since component unmounted
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('should reset timer when open changes from false to true', () => {
      const onOpenChange = vi.fn();

      const { rerender } = render(
        <TranscriptionStatusPopover open={false} onOpenChange={onOpenChange} />
      );

      // Advance time while closed
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Open the popover
      rerender(
        <TranscriptionStatusPopover open={true} onOpenChange={onOpenChange} />
      );

      // Advance 50 seconds - should not fire yet (timer started fresh)
      act(() => {
        vi.advanceTimersByTime(50000);
      });
      expect(onOpenChange).not.toHaveBeenCalled();

      // Advance 10 more seconds (60 total from when it opened)
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('animation classes', () => {
    it('should have animation classes for entrance', () => {
      render(
        <TranscriptionStatusPopover open={true} onOpenChange={vi.fn()} />
      );

      const content = screen.getByRole('alert').closest('[data-state]');
      // Check for Radix animation data attributes or animation classes
      expect(content).toBeInTheDocument();
    });
  });
});
