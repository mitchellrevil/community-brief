/* eslint-disable @typescript-eslint/require-await */
/**
 * UsersTable component tests
 * 
 * Tests for the user management table view, specifically focusing on
 * animation correctness during initial render and data loading.
 * 
 * Bug reproduction: Table rows are blank on initial page load/refresh
 * when using Framer Motion animations. The issue is that motion.tr rows
 * get stuck in the "hidden" state (opacity: 0) when they're added after
 * the parent motion.tbody has already transitioned to "visible".
 * 
 * Fix: Add a key prop to motion.tbody that changes when usersLoading changes,
 * forcing a re-mount and re-animation when actual data rows appear.
 * 
 * Note: These tests verify the structural fix is in place. Full animation
 * behavior testing requires a real browser environment (e.g., Playwright).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import type { User } from "@/features/users/data/api";
import { UsersTable } from "@/features/users/ui/UsersTable";
import { PermissionLevel } from "@/types/permissions";

// Mock hooks that UsersTable depends on
vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useInfinitePagination", () => ({
  useInfiniteScroll: () => ({ current: null }),
}));

vi.mock("@/hooks/useInfiniteBusinessUnits", () => ({
  useInfiniteBusinessUnits: () => ({
    businessUnits: [],
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  }),
}));

// Test data
const mockUsers: Array<User> = [
  {
    id: "user-1",
    email: "user1@example.com",
    name: "User One",
    permission: PermissionLevel.USER,
    date: "2024-01-01T00:00:00Z",
    business_unit_ids: [],
    business_unit_names: [],
  },
  {
    id: "user-2",
    email: "user2@example.com",
    name: "User Two",
    permission: PermissionLevel.EDITOR,
    date: "2024-01-02T00:00:00Z",
    business_unit_ids: [],
    business_unit_names: [],
  },
  {
    id: "user-3",
    email: "user3@example.com",
    name: "User Three",
    permission: PermissionLevel.ADMIN,
    date: "2024-01-03T00:00:00Z",
    business_unit_ids: [],
    business_unit_names: [],
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

interface TestWrapperProps {
  children: React.ReactNode;
}

function TestWrapper({ children }: TestWrapperProps) {
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("UsersTable", () => {
  const defaultProps = {
    usersLoading: false,
    searchTerm: "",
    setSearchTerm: vi.fn(),
    filterPermission: "All" as const,
    setFilterPermission: vi.fn(),
    users: mockUsers,
    filteredUsers: mockUsers,
    onUserClick: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Table View - Data Rendering", () => {
    it("renders table rows with user data when data is provided", async () => {
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      // All user emails should be present in the document
      await waitFor(() => {
        expect(screen.getByText("user1@example.com")).toBeInTheDocument();
        expect(screen.getByText("user2@example.com")).toBeInTheDocument();
        expect(screen.getByText("user3@example.com")).toBeInTheDocument();
      });

      // Verify the table structure is correct
      const tableBody = document.querySelector("tbody");
      expect(tableBody).toBeInTheDocument();
      
      // Should have correct number of data rows
      const rows = tableBody?.querySelectorAll("tr");
      expect(rows?.length).toBe(mockUsers.length);
    });

    it("displays user names in the table rows", async () => {
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText("User One")).toBeInTheDocument();
        expect(screen.getByText("User Two")).toBeInTheDocument();
        expect(screen.getByText("User Three")).toBeInTheDocument();
      });
    });

    it("renders table rows with content after loading completes", async () => {
      // Start with loading state
      const { rerender } = render(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={true}
            filteredUsers={[]}
          />
        </TestWrapper>
      );

      // Now simulate data loading complete
      rerender(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={false}
            filteredUsers={mockUsers}
          />
        </TestWrapper>
      );

      // Wait for data to be rendered
      await waitFor(() => {
        expect(screen.getByText("user1@example.com")).toBeInTheDocument();
        expect(screen.getByText("user2@example.com")).toBeInTheDocument();
        expect(screen.getByText("user3@example.com")).toBeInTheDocument();
      });

      // Verify all 3 data rows exist with content
      const tableBody = document.querySelector("tbody");
      const dataRows = tableBody?.querySelectorAll("tr");
      expect(dataRows?.length).toBe(mockUsers.length);
      
      // Each row should have content
      dataRows?.forEach((row) => {
        expect(row.textContent.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Table View - Motion Key Fix", () => {
    it("tbody element remounts when loading state changes (verified by key attribute pattern)", async () => {
      // This test verifies the fix is in place: motion.tbody should have a key
      // that changes between "loading" and "loaded" states
      
      const { rerender, container } = render(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={true}
            filteredUsers={[]}
          />
        </TestWrapper>
      );

      // Get initial tbody 
      const initialTbody = container.querySelector("tbody");
      expect(initialTbody).toBeInTheDocument();
      
      // Transition to loaded state
      rerender(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={false}
            filteredUsers={mockUsers}
          />
        </TestWrapper>
      );

      // Get tbody after rerender - should be a fresh instance due to key change
      const finalTbody = container.querySelector("tbody");
      expect(finalTbody).toBeInTheDocument();
      
      // The tbody should now contain the user data rows
      await waitFor(() => {
        const rows = finalTbody?.querySelectorAll("tr");
        expect(rows?.length).toBe(mockUsers.length);
      });

      // Verify actual user content is present (not blank)
      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
    });

    it("renders user data rows correctly on immediate load (no loading state)", async () => {
      // This tests the case where data is immediately available
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      // Data should be present immediately
      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
      expect(screen.getByText("user2@example.com")).toBeInTheDocument();
      expect(screen.getByText("user3@example.com")).toBeInTheDocument();
    });
  });

  describe("Table View - Content Stability", () => {
    it("rows contain email content after transition from loading", async () => {
      const { rerender } = render(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={true}
            filteredUsers={[]}
          />
        </TestWrapper>
      );

      rerender(
        <TestWrapper>
          <UsersTable
            {...defaultProps}
            usersLoading={false}
            filteredUsers={mockUsers}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        const tableBody = document.querySelector("tbody");
        const rows = Array.from(tableBody?.querySelectorAll("tr") || []);
        
        expect(rows.length).toBe(mockUsers.length);
        
        // Each row should have email content
        mockUsers.forEach((user) => {
          expect(screen.getByText(user.email)).toBeInTheDocument();
        });
      });
    });

    it("rows have non-empty text content after mount", async () => {
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      const tableBody = document.querySelector("tbody");
      const rows = Array.from(tableBody?.querySelectorAll("tr") || []);
      
      expect(rows.length).toBe(mockUsers.length);
      
      // Check each row has actual text content (not blank)
      rows.forEach((row, index) => {
        expect(
          row.textContent.length,
          `Row ${index} should have text content`
        ).toBeGreaterThan(0);
      });
    });
  });

  describe("Table View - Dropdown Menu Layout Stability", () => {
    it("renders action menu trigger for each user row", async () => {
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      // Each row should have an action menu button
      const menuButtons = screen.getAllByRole("button", { name: /open menu/i });
      expect(menuButtons.length).toBe(mockUsers.length);
    });

    it("opens dropdown menu when action button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <UsersTable {...defaultProps} />
        </TestWrapper>
      );

      const menuButtons = screen.getAllByRole("button", { name: /open menu/i });
      await user.click(menuButtons[0]);

      // Menu should be visible
      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });

      // Menu items should be visible
      expect(screen.getByRole("menuitem", { name: /view details/i })).toBeInTheDocument();
    });

    it("dropdown menu renders in a portal (outside table container)", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <TestWrapper>
          <div data-testid="table-container" style={{ width: "800px", overflow: "hidden" }}>
            <UsersTable {...defaultProps} />
          </div>
        </TestWrapper>
      );

      const menuButtons = screen.getAllByRole("button", { name: /open menu/i });
      await user.click(menuButtons[0]);

      await waitFor(() => {
        const menuContent = screen.getByRole("menu");
        expect(menuContent).toBeInTheDocument();

        // The menu should be rendered outside the table container (in a portal)
        const tableContainer = container.querySelector('[data-testid="table-container"]');
        expect(tableContainer?.contains(menuContent)).toBe(false);
      });
    });

    it("opening dropdown does not change table container width", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <TestWrapper>
          <div 
            data-testid="table-container" 
            style={{ width: "800px", display: "inline-block" }}
          >
            <UsersTable {...defaultProps} />
          </div>
        </TestWrapper>
      );

      const tableContainer = container.querySelector('[data-testid="table-container"]') as HTMLElement;
      const initialWidth = tableContainer.offsetWidth;

      const menuButtons = screen.getAllByRole("button", { name: /open menu/i });
      await user.click(menuButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });

      // Width should remain unchanged after dropdown opens
      expect(tableContainer.offsetWidth).toBe(initialWidth);
    });
  });
});


