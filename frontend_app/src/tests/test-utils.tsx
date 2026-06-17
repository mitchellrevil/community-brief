import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {   render } from "@testing-library/react";
import * as React from "react";
import { AllProviders,  createTestQueryClient } from "./providers";
import type {RenderOptions, RenderResult} from "@testing-library/react";
import type {AllProvidersConfig} from "./providers";
import type { ReactElement, ReactNode } from "react";
import type { TestAuthConfig } from "./providers/TestAuth";

/**
 * Creates a fresh QueryClient instance for testing with appropriate settings.
 * - Retries disabled to fail fast
 * - gcTime set to avoid garbage collection during tests
 * - staleTime set to prevent unnecessary refetches during test
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 5 * 60 * 1000,
        staleTime: 30 * 1000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Creates a wrapper component for testing hooks that require QueryClientProvider.
 * @param queryClient - The QueryClient instance to use
 * @returns A wrapper component that provides the QueryClient
 */
export function createQueryClientWrapper(queryClient: QueryClient) {
  return function QueryClientWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

/**
 * Options for renderWithProviders
 */
export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Auth configuration for mock user state */
  auth?: TestAuthConfig;
  /** Custom QueryClient instance */
  queryClient?: QueryClient;
  /** Initial router path */
  initialPath?: string;
  /** Full provider config (overrides auth, queryClient, initialPath) */
  providerConfig?: AllProvidersConfig;
}

/**
 * Extended render result that includes the QueryClient for test assertions
 */
export interface RenderWithProvidersResult extends RenderResult {
  queryClient: QueryClient;
}

/**
 * Renders a React element with all providers (QueryClient, Router, Theme, Auth).
 * 
 * This is the primary render utility for integration tests that need
 * full provider context.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const { getByText } = renderWithProviders(<MyComponent />);
 * 
 * // With custom auth state
 * const { queryClient } = renderWithProviders(<MyComponent />, {
 *   auth: { isAuthenticated: true, user: { email: 'admin@test.com', permission: 'Admin' } }
 * });
 * 
 * // With custom QueryClient for cache assertions
 * const queryClient = createQueryClient();
 * renderWithProviders(<MyComponent />, { queryClient });
 * expect(queryClient.getQueryData(['my-key'])).toBeDefined();
 * ```
 * 
 * @param ui - The React element to render
 * @param options - Render options including auth, queryClient, and initialPath
 * @returns Extended RenderResult with queryClient property
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderWithProvidersResult {
  const {
    auth,
    queryClient: providedClient,
    initialPath,
    providerConfig,
    ...renderOptions
  } = options;

  // Create a fresh QueryClient for each render to ensure test isolation
  const queryClient = providedClient || createTestQueryClient();

  // Build provider config, merging individual options with providerConfig
  const config: AllProvidersConfig = {
    queryClient,
    ...providerConfig,
    // Individual options override providerConfig
    ...(auth && { auth }),
    ...(initialPath && { initialPath }),
  };

  // Create wrapper that uses AllProviders
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AllProviders {...config}>
        {children}
      </AllProviders>
    );
  }

  // Render with the wrapper
  const renderResult = render(ui, { wrapper: Wrapper, ...renderOptions });

  // Return extended result with queryClient
  return {
    ...renderResult,
    queryClient,
  };
}

/**
 * Re-export providers and utilities for convenience
 */
export { AllProviders, createTestQueryClient, createAllProvidersWrapper } from "./providers";
export { mockUsers, createAuthConfig } from "./providers/TestAuth";
export { themeConfigs } from "./providers/TestTheme";
