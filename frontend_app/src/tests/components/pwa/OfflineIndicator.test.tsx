/* eslint-disable @typescript-eslint/require-await */
/**
 * OfflineIndicator Component Tests
 * 
 * Tests the offline indicator banner with online/offline states.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { useUploadQueue } from "@/hooks/useUploadQueue";

// Mock the entire module before imports
vi.mock("@/hooks/useUploadQueue", () => ({
  useUploadQueue: vi.fn(),
}));

// Mock the dynamic import in the component
vi.mock("@/lib/pwa-queue", async () => {
  return {
    getQueueStats: vi.fn(async () => ({ totalSize: 0 })),
    getQueuedCount: vi.fn(async () => 0),
  };
});

const mockUseUploadQueue = vi.mocked(useUploadQueue);

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should show banner when offline", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: false,
      queuedCount: 0,
      isProcessing: false,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it("should hide when online with no queued items", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: true,
      queuedCount: 0,
      isProcessing: false,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    const { container } = renderWithQueryClient(<OfflineIndicator />);

    // Should render null (empty)
    expect(container.firstChild).toBeNull();
  });

  it("should show queued count when offline", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: false,
      queuedCount: 3,
      isProcessing: false,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.getByText(/3 queued/i)).toBeInTheDocument();
  });

  it("should show syncing state when online and processing", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: true,
      queuedCount: 2,
      isProcessing: true,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    expect(screen.getByText(/syncing 2 recordings/i)).toBeInTheDocument();
  });

  it("should show waiting to upload when online with queued items", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: true,
      queuedCount: 5,
      isProcessing: false,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    expect(screen.getByText(/5 recordings.*waiting to upload/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload now/i })).toBeInTheDocument();
  });

  it("should call syncQueue when Upload Now is clicked", async () => {
    const user = userEvent.setup();
    const mockSyncQueue = vi.fn();
    
    mockUseUploadQueue.mockReturnValue({
      isOnline: true,
      queuedCount: 2,
      isProcessing: false,
      syncQueue: mockSyncQueue,
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    const uploadButton = screen.getByRole("button", { name: /upload now/i });
    await user.click(uploadButton);

    expect(mockSyncQueue).toHaveBeenCalledTimes(1);
  });

  it("should display message about automatic upload restoration", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: false,
      queuedCount: 1,
      isProcessing: false,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    expect(
      screen.getByText(/recordings will upload automatically when connection is restored/i)
    ).toBeInTheDocument();
  });

  it("should handle singular recording count properly", () => {
    mockUseUploadQueue.mockReturnValue({
      isOnline: true,
      queuedCount: 1,
      isProcessing: true,
      syncQueue: vi.fn(),
      stats: null,
      refreshQueue: vi.fn(),
      retryAll: vi.fn(),
    });

    renderWithQueryClient(<OfflineIndicator />);

    // Should use singular "recording" instead of "recordings"
    expect(screen.getByText(/syncing 1 recording(?!s)/i)).toBeInTheDocument();
  });
});
