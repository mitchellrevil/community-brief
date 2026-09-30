/**
 * MicrosoftLoginButton Component Tests
 * 
 * Tests the Microsoft SSO login button with MSAL integration.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MicrosoftLoginButton } from "@/features/auth/ui/MicrosoftLoginButton";

describe("MicrosoftLoginButton", () => {
  const mockOnLogin = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should trigger MSAL login on click", async () => {
    const user = userEvent.setup();
    mockOnLogin.mockResolvedValue(undefined);

    render(<MicrosoftLoginButton onLogin={mockOnLogin} />);

    const button = screen.getByRole("button", { name: /sign in with microsoft/i });
    await user.click(button);

    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });

  it("should show loading state while signing in", async () => {
    const user = userEvent.setup();
    
    // Create a promise that we control
    let resolveLogin: () => void;
    const loginPromise = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    mockOnLogin.mockReturnValue(loginPromise);

    render(<MicrosoftLoginButton onLogin={mockOnLogin} />);

    const button = screen.getByRole("button", { name: /sign in with microsoft/i });
    
    // Click to start login
    await user.click(button);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
    
    // Button should be disabled during loading
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    // Resolve login
    resolveLogin!();
    
    await waitFor(() => {
      expect(screen.getByText(/sign in with microsoft/i)).toBeInTheDocument();
    });
  });

  it("should handle login error and display error message", async () => {
    const user = userEvent.setup();
    const errorMessage = "Authentication failed";
    mockOnLogin.mockRejectedValue(new Error(errorMessage));

    render(<MicrosoftLoginButton onLogin={mockOnLogin} />);

    const button = screen.getByRole("button", { name: /sign in with microsoft/i });
    await user.click(button);

    // Should display error message
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(errorMessage);
    });

    // Button should be re-enabled after error
    expect(button).not.toBeDisabled();
  });

  it("should be disabled when disabled prop is true", () => {
    render(<MicrosoftLoginButton onLogin={mockOnLogin} disabled />);

    const button = screen.getByRole("button", { name: /sign in with microsoft/i });
    expect(button).toBeDisabled();
  });
});
