/* eslint-disable @typescript-eslint/require-await */
/**
 * ErrorBoundary Component Tests
 * 
 * Tests the error boundary display with fallback UI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@/components/error-boundary";
import { renderWithProviders } from "@/tests/test-utils";

// Mock useRouter from TanStack Router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useRouter: () => ({
      navigate: vi.fn(),
    }),
  };
});

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should catch and display error message", () => {
    const testError = new Error("Something went wrong!");

    renderWithProviders(
      <ErrorBoundary error={testError} />
    );

    // Should display the error message
    expect(screen.getByText("Something went wrong!")).toBeInTheDocument();
    
    // Should display the title
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should have fallback UI with Try again button", async () => {
    const user = userEvent.setup();
    const testError = new Error("Test error");
    const mockReset = vi.fn();

    renderWithProviders(
      <ErrorBoundary error={testError} reset={mockReset} />
    );

    // Should have a Try again button
    const tryAgainButton = screen.getByRole("button", { name: /try again/i });
    expect(tryAgainButton).toBeInTheDocument();

    // Click should call reset
    await user.click(tryAgainButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("should have Go Home button", async () => {
    const testError = new Error("Test error");

    renderWithProviders(
      <ErrorBoundary error={testError} />
    );

    // Should have a Go Home button
    const goHomeButton = screen.getByRole("button", { name: /go home/i });
    expect(goHomeButton).toBeInTheDocument();
  });

  it("should display route error message when isRouteError is true", () => {
    const testError = new Error("404 Not Found");

    renderWithProviders(
      <ErrorBoundary error={testError} isRouteError />
    );

    // Should show route-specific message
    expect(screen.getByText("Failed to load this page")).toBeInTheDocument();
  });

  it("should display generic error message when isRouteError is false", () => {
    const testError = new Error("Generic error");

    renderWithProviders(
      <ErrorBoundary error={testError} isRouteError={false} />
    );

    expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument();
  });

  it("should handle error without message gracefully", () => {
    const testError = new Error();

    renderWithProviders(
      <ErrorBoundary error={testError} />
    );

    // Should show fallback message
    expect(screen.getByText("Unknown error")).toBeInTheDocument();
  });
});

