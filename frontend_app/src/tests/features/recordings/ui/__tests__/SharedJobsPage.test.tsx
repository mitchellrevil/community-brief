import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharedJobsPage } from '@/features/recordings/ui/SharedJobsPage';

// Mock API
const mockGetSharedJobs = vi.fn();
vi.mock('@/features/recordings/data/api', () => ({
  getSharedJobs: () => mockGetSharedJobs(),
}));

// Lightweight UI primitives mocks
vi.mock('@/components/ui/smart-breadcrumb', () => ({ SmartBreadcrumb: () => <div data-testid="smart-breadcrumb" /> }));
vi.mock('@/components/ui/page-heading', () => ({ PageHeading: ({ title }: any) => <div data-testid="page-heading">{title}</div> }));
vi.mock('@/components/ui/status-badge', () => ({ StatusBadge: ({ status }: any) => <div data-testid="status-badge">{status}</div> }));
vi.mock('@/components/ui/recording-card-skeleton', () => ({ RecordingCardSkeletonGrid: ({ count }: any) => <div data-testid="skeleton-grid">{count}</div> }));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));

// Router Link mock
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: any) => <a href={to}>{children}</a> }));

// Breadcrumbs hook
vi.mock('@/hooks/useBreadcrumbs', () => ({ useBreadcrumbs: () => [] }));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SharedJobsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorts shared-with-me jobs by shared_at desc (fallback to created_at)', async () => {
    const sharedJobs = [
      { id: 'a', displayname: 'Job A', shared_at: 1000, created_at: 500 },
      { id: 'b', displayname: 'Job B', shared_at: 2000, created_at: 1500 },
      { id: 'c', displayname: 'Job C', created_at: 3000 }, // no shared_at
    ];

    mockGetSharedJobs.mockResolvedValue({ status: 'ok', message: '', shared_jobs: sharedJobs, owned_jobs_shared_with_others: [] });

    const { container } = renderWithProviders(<SharedJobsPage />);

    const jobC = await screen.findByText('Job C');
    const section = jobC.closest('section');
    expect(section).toBeTruthy();

    const headings = Array.from(section!.querySelectorAll('h3')).map(h => h.textContent);
    // Expected order by value used in sorting: Job C (3000), Job B (2000), Job A (1000)
    expect(headings).toEqual(['Job C', 'Job B', 'Job A']);
  });

  it('sorts owned shared jobs by created_at desc', async () => {
    const owned = [
      { id: 'o1', displayname: 'Owned One', created_at: 1000 },
      { id: 'o2', displayname: 'Owned Two', created_at: 3000 },
    ];

    mockGetSharedJobs.mockResolvedValue({ status: 'ok', message: '', shared_jobs: [], owned_jobs_shared_with_others: owned });

    const { container } = renderWithProviders(<SharedJobsPage />);

    const ownedTwo = await screen.findByText('Owned Two');
    const section = ownedTwo.closest('section');
    const headings = Array.from(section!.querySelectorAll('h3')).map(h => h.textContent);
    expect(headings).toEqual(['Owned Two', 'Owned One']);
  });

  it('shows shared-by email (top-level) and falls back to share entry user_email', async () => {
    const sharedJobs = [
      { id: 's1', displayname: 'Top Shared', shared_by_email: 'alice@example.com', created_at: 1000, message: 'Hello Alice' },
      { id: 's2', displayname: 'Entry Shared', created_at: 2000, shared_with: [{ user_email: 'bob@example.com' }] },
    ];

    mockGetSharedJobs.mockResolvedValue({ status: 'ok', message: '', shared_jobs: sharedJobs, owned_jobs_shared_with_others: [] });

    renderWithProviders(<SharedJobsPage />);

    await screen.findByText('Top Shared');

    // Sharer names are displayed (email prefix formatted: alice@example.com -> Alice)
    // In card view, names are shown directly without "by" prefix
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Message should be visible when present
    expect(screen.getByText(/Hello Alice/)).toBeInTheDocument();
  });

  it('owner cards show Shared with count from shared_with_count or shared_with length', async () => {
    const owned = [
      { id: 'o1', displayname: 'Owner A', created_at: 1000, shared_with_count: 5 },
      { id: 'o2', displayname: 'Owner B', created_at: 2000, shared_with: [{ user_email: 'x' }, { user_email: 'y' }] },
    ];

    mockGetSharedJobs.mockResolvedValue({ status: 'ok', message: '', shared_jobs: [], owned_jobs_shared_with_others: owned });

    renderWithProviders(<SharedJobsPage />);

    await screen.findByText('Owner A');

    // Owner cards in card view show "{count} recipient{s}" format
    expect(screen.getByText(/5 recipients/)).toBeInTheDocument();
    expect(screen.getByText(/2 recipients/)).toBeInTheDocument();
  });
});


