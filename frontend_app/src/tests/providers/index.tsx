import * as React from 'react';
import { MsalProvider } from '@azure/msal-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestRouter  } from './TestRouter';
import { TestTheme,  defaultTestThemeConfig } from './TestTheme';
import {  createAuthQueryClient, mockUsers } from './TestAuth';
import type {TestRouterProps} from './TestRouter';
import type {TestThemeConfig} from './TestTheme';
import type {TestAuthConfig} from './TestAuth';
import { msalInstance } from '@/features/auth/lib/msal';

export { TestRouter, type TestRouterProps } from './TestRouter';
export { TestAuth, mockUsers, createAuthConfig, type TestAuthConfig, type MockUser } from './TestAuth';
export { TestTheme, themeConfigs, type TestThemeConfig } from './TestTheme';

/**
 * Configuration options for AllProviders wrapper
 */
export interface AllProvidersConfig {
  /** Custom QueryClient instance (a fresh one is created if not provided) */
  queryClient?: QueryClient;
  /** Auth configuration for mock user state */
  auth?: TestAuthConfig;
  /** Theme configuration */
  theme?: TestThemeConfig;
  /** Initial router path */
  initialPath?: string;
}

/**
 * Props for the AllProviders component
 */
export interface AllProvidersProps extends AllProvidersConfig {
  children: React.ReactNode;
}

/**
 * Creates a fresh QueryClient for testing with appropriate defaults.
 * Each call returns a new instance to ensure test isolation.
 */
export function createTestQueryClient(): QueryClient {
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
 * AllProviders - Combines all necessary providers for testing React components.
 * 
 * Includes:
 * - TanStack Query (QueryClientProvider) with fresh or custom QueryClient
 * - MSAL React provider for hooks that depend on authentication context
 * - TanStack Router (mock router context with useNavigate, useRouter hooks)
 * - Theme Provider (next-themes with test-friendly defaults)
 * - Auth Context (pre-populated user permissions for useAuth, usePermissions hooks)
 * 
 * @example
 * ```tsx
 * // Basic usage
 * render(<AllProviders><MyComponent /></AllProviders>);
 * 
 * // With custom auth
 * render(
 *   <AllProviders auth={{ isAuthenticated: true, user: { email: 'admin@test.com', permission: 'Admin' } }}>
 *     <AdminComponent />
 *   </AllProviders>
 * );
 * 
 * // With custom QueryClient
 * const queryClient = createTestQueryClient();
 * render(
 *   <AllProviders queryClient={queryClient}>
 *     <MyComponent />
 *   </AllProviders>
 * );
 * ```
 */
export function AllProviders({
  children,
  queryClient,
  auth = mockUsers.user,
  theme = defaultTestThemeConfig,
  initialPath = '/',
}: AllProvidersProps) {
  // Create or configure the query client with auth data
  const configuredClient = React.useMemo(() => {
    const client = queryClient || createTestQueryClient();
    return createAuthQueryClient(auth, client);
  }, [queryClient, auth]);

  return (
    <QueryClientProvider client={configuredClient}>
      <MsalProvider instance={msalInstance}>
        <TestTheme config={theme}>
          <TestRouter initialPath={initialPath}>
            {children}
          </TestRouter>
        </TestTheme>
      </MsalProvider>
    </QueryClientProvider>
  );
}

/**
 * Creates an AllProviders wrapper function for use with @testing-library/react's wrapper option.
 * 
 * @example
 * ```tsx
 * const wrapper = createAllProvidersWrapper({ auth: mockUsers.admin });
 * const { result } = renderHook(() => useMyHook(), { wrapper });
 * ```
 */
export function createAllProvidersWrapper(config?: AllProvidersConfig) {
  return function ProvidersWrapper({ children }: { children: React.ReactNode }) {
    return (
      <AllProviders {...config}>
        {children}
      </AllProviders>
    );
  };
}

export default AllProviders;
