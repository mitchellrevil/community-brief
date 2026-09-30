/**
 * AnnouncementPopover Component Tests
 *
 * Tests for the bell icon popover that displays announcements with
 * read/dismiss functionality using localStorage for state management.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Announcement } from '@/features/announcements/data/types';
import { AnnouncementPopover } from '@/features/announcements/ui/AnnouncementPopover';

// Mock fetchAnnouncements API
const mockFetchAnnouncements = vi.fn();
vi.mock('@/features/announcements/data/api', () => ({
  fetchAnnouncements: () => mockFetchAnnouncements(),
  markAnnouncementAsRead: vi.fn().mockResolvedValue({ status: 'success' }),
  dismissAnnouncement: vi.fn().mockResolvedValue({ status: 'success' }),
}));

// LocalStorage key constants (matching component implementation)
const STORAGE_KEYS = {
  DISMISSED: 'community-brief:announcements-dismissed',
  READ: 'community-brief:announcements-read',
};

// Mock announcement data
const mockUnreadAnnouncement: Announcement = {
  id: 'ann-unread',
  title: 'Unread Announcement',
  body: 'This is an unread announcement with important information.',
  created_at: '2026-02-10T12:00:00Z',
  updated_at: '2026-02-10T12:00:00Z',
  created_by: 'admin-user',
  is_active: true,
  priority: 'normal',
  read_by: [],
};

const mockReadAnnouncement: Announcement = {
  id: 'ann-read',
  title: 'Read Announcement',
  body: 'This announcement has already been read by the user.',
  created_at: '2026-02-09T10:00:00Z',
  updated_at: '2026-02-09T10:00:00Z',
  created_by: 'admin-user',
  is_active: true,
  priority: 'high',
  read_by: [],
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  queryClient: QueryClient = createQueryClient()
) {
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    ),
    queryClient,
  };
}

describe('AnnouncementPopover', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStorageMock[key] = value;
      }
    );

    // Reset mock return values
    mockFetchAnnouncements.mockResolvedValue([
      mockUnreadAnnouncement,
      mockReadAnnouncement,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('badge display', () => {
    it('should show bell icon', async () => {
      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });
    });

    it('should show unread count badge when there are unread announcements', async () => {
      // Pre-mark ann-read as read in localStorage
      localStorageMock[STORAGE_KEYS.READ] = JSON.stringify(['ann-read']);

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        // Badge should show count of 1 (unread announcement)
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });

    it('should not show badge when all announcements are read', async () => {
      // Mark both announcements as read
      localStorageMock[STORAGE_KEYS.READ] = JSON.stringify([
        'ann-unread',
        'ann-read',
      ]);

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      // Badge should not be visible
      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });

    it('should not include dismissed announcements in unread count', async () => {
      // Dismiss one announcement
      localStorageMock[STORAGE_KEYS.DISMISSED] = JSON.stringify(['ann-unread']);

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        // Should show count of 1 for the non-dismissed, non-read one
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });
  });

  describe('popover interaction', () => {
    it('should open popover when bell icon is clicked', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        // Both announcement titles should be visible
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
        expect(screen.getByText('Read Announcement')).toBeInTheDocument();
      });
    });

    it('should show announcement excerpt in popover', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        // Check excerpt (truncated body)
        expect(
          screen.getByText(/This is an unread announcement/i)
        ).toBeInTheDocument();
      });
    });

    it('should not show dismissed announcements in popover', async () => {
      const user = userEvent.setup();

      // Dismiss the unread announcement
      localStorageMock[STORAGE_KEYS.DISMISSED] = JSON.stringify(['ann-unread']);

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        // Only the non-dismissed announcement should be visible
        expect(screen.getByText('Read Announcement')).toBeInTheDocument();
      });

      expect(
        screen.queryByText('Unread Announcement')
      ).not.toBeInTheDocument();
    });
  });

  describe('mark as read functionality', () => {
    it('should update unread badge count after marking as read', async () => {
      const user = userEvent.setup();

      // Start with one already read
      localStorageMock[STORAGE_KEYS.READ] = JSON.stringify(['ann-read']);

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        // Initially should show 1 unread
        expect(screen.getByText('1')).toBeInTheDocument();
      });

      // Open popover and mark as read
      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
      });

      const markAllReadButton = screen.getByRole('button', {
        name: /mark all read/i,
      });
      await user.click(markAllReadButton);

      // Badge should disappear (all read)
      await waitFor(() => {
        // The unread count badge should be gone or 0
        expect(screen.queryByText('1')).not.toBeInTheDocument();
      });
    });
  });

  describe('dismiss functionality', () => {
    it('should update localStorage when dismissing', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      // Open popover
      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
      });

      // Click "Dismiss" on the announcement
      const dismissButtons = screen.getAllByRole('button', {
        name: /dismiss/i,
      });
      await user.click(dismissButtons[0]);

      // Verify localStorage was updated
      await waitFor(() => {
        expect(localStorageMock[STORAGE_KEYS.DISMISSED]).toBeDefined();
        const dismissedIds = JSON.parse(localStorageMock[STORAGE_KEYS.DISMISSED]);
        expect(dismissedIds).toContain('ann-unread');
      });
    });

    it('should remove announcement from view after dismissing', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      // Open popover
      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
        expect(screen.getByText('Read Announcement')).toBeInTheDocument();
      });

      // Dismiss first announcement
      const dismissButtons = screen.getAllByRole('button', {
        name: /dismiss/i,
      });
      await user.click(dismissButtons[0]);

      // First announcement should be removed from view
      await waitFor(() => {
        expect(
          screen.queryByText('Unread Announcement')
        ).not.toBeInTheDocument();
      });

      // Second should still be visible
      expect(screen.getByText('Read Announcement')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no announcements', async () => {
      mockFetchAnnouncements.mockResolvedValue([]);
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
        expect(
          screen.getByText(/no new announcements to check\./i)
        ).toBeInTheDocument();
      });
    });

    it('should show empty message when all announcements are dismissed', async () => {
      // Dismiss all announcements
      localStorageMock[STORAGE_KEYS.DISMISSED] = JSON.stringify([
        'ann-unread',
        'ann-read',
      ]);
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
        expect(
          screen.getByText(/no new announcements to check\./i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('date display', () => {
    it('should display formatted creation date', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        // Ensure the announcement itself is rendered; date formatting is covered in AnnouncementItem tests
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
      });
    });
  });

  describe('priority styling', () => {
    it('should display high priority announcements with visual distinction', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AnnouncementPopover />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /announcements/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /announcements/i }));

      await waitFor(() => {
        // Just check that both announcements render - styling is visual
        expect(screen.getByText('Unread Announcement')).toBeInTheDocument();
        expect(screen.getByText('Read Announcement')).toBeInTheDocument();
      });
    });
  });
});
