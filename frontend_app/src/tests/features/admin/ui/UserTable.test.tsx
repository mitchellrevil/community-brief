/**
 * UserTable Component Tests
 * 
 * Tests the user table with display and filtering functionality.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {User} from "@/features/admin/ui/UserTable";
import {  UserTable } from "@/features/admin/ui/UserTable";

describe("UserTable", () => {
  const mockUsers: Array<User> = [
    { id: "1", email: "admin@example.com", name: "Admin User", permission: "Admin" },
    { id: "2", email: "editor@example.com", name: "Editor User", permission: "Editor" },
    { id: "3", email: "user@example.com", name: "Regular User", permission: "User" },
  ];

  const mockOnUserClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display user list with permissions", () => {
    render(<UserTable users={mockUsers} />);

    // Should display all users
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();

    // Should display names
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Editor User")).toBeInTheDocument();
    expect(screen.getByText("Regular User")).toBeInTheDocument();

    // Should display permission badges (User appears twice - once in header, once as badge)
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    // Use getAllByText for "User" since it appears in column header and badge
    const userTexts = screen.getAllByText("User");
    expect(userTexts.length).toBe(2); // Header + Badge
  });

  it("should filter users by search term (email)", async () => {
    const user = userEvent.setup();

    render(<UserTable users={mockUsers} />);

    // Type in search
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "admin");

    // Should only show admin user
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.queryByText("editor@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();

    // Should show filtered count
    expect(screen.getByText(/showing 1 of 3 users/i)).toBeInTheDocument();
  });

  it("should filter users by search term (name)", async () => {
    const user = userEvent.setup();

    render(<UserTable users={mockUsers} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Regular");

    // Should only show user matching name
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("editor@example.com")).not.toBeInTheDocument();
  });

  it("should handle empty user list", () => {
    render(<UserTable users={[]} />);

    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("should show no results message when search has no matches", async () => {
    const user = userEvent.setup();

    render(<UserTable users={mockUsers} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "nonexistent");

    expect(screen.getByText("No users match your search.")).toBeInTheDocument();
  });

  it("should call onUserClick when row is clicked", async () => {
    const user = userEvent.setup();

    render(<UserTable users={mockUsers} onUserClick={mockOnUserClick} />);

    // Click on a user row
    const userRow = screen.getByTestId("user-row-2");
    await user.click(userRow);

    expect(mockOnUserClick).toHaveBeenCalledWith("2");
  });

  it("should show loading skeleton when isLoading is true", () => {
    render(<UserTable users={[]} isLoading />);

    // Should not show empty message
    expect(screen.queryByText("No users found.")).not.toBeInTheDocument();
    
    // Should show skeleton loading state - Skeleton component uses animate-pulse class
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("should display correct permission badge variants", () => {
    render(<UserTable users={mockUsers} />);

    // Check that badges have appropriate styling classes
    const adminBadge = screen.getByText("Admin");
    const editorBadge = screen.getByText("Editor");
    // "User" appears in both header and badge, find the badge by looking at row
    const userRow = screen.getByTestId("user-row-3");
    const userBadge = userRow.querySelector('[class*="inline-flex"]');

    // Admin should have destructive variant
    expect(adminBadge.className).toContain("destructive");
    
    // Editor should have primary variant (not default)
    expect(editorBadge.className).toContain("primary");
    
    // User should have secondary variant
    expect(userBadge?.className).toContain("secondary");
  });
});
