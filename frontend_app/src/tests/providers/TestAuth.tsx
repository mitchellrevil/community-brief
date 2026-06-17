import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authSessionQueryKey } from '@/features/auth/data/queries';
import { PermissionLevel } from '@/types/permissions';

/**
 * Mock user interface for testing
 */
export interface MockUser {
  user_id?: string;
  email: string;
  permission: PermissionLevel | string;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
}

/**
 * Auth configuration for testing
 */
export interface TestAuthConfig {
  isAuthenticated: boolean;
  user: MockUser | null;
  isLoading?: boolean;
}

/**
 * Props for the TestAuth component
 */
export interface TestAuthProps {
  children: React.ReactNode;
  config?: TestAuthConfig;
  queryClient?: QueryClient;
}

/**
 * Default mock user configurations for common test scenarios
 */
export const mockUsers = {
  guest: {
    isAuthenticated: false,
    user: null,
    isLoading: false,
  } as TestAuthConfig,

  user: {
    isAuthenticated: true,
    user: {
      user_id: 'test-user-id',
      email: 'user@example.com',
      permission: PermissionLevel.USER,
      business_unit_ids: [],
      business_unit_names: [],
    },
    isLoading: false,
  } as TestAuthConfig,

  editor: {
    isAuthenticated: true,
    user: {
      user_id: 'test-editor-id',
      email: 'editor@example.com',
      permission: PermissionLevel.EDITOR,
      business_unit_ids: ['unit-1'],
      business_unit_names: ['Test Unit'],
    },
    isLoading: false,
  } as TestAuthConfig,

  admin: {
    isAuthenticated: true,
    user: {
      user_id: 'test-admin-id',
      email: 'admin@example.com',
      permission: PermissionLevel.ADMIN,
      business_unit_ids: ['unit-1', 'unit-2'],
      business_unit_names: ['Test Unit', 'Admin Unit'],
    },
    isLoading: false,
  } as TestAuthConfig,

  moderator: {
    isAuthenticated: true,
    user: {
      user_id: 'test-moderator-id',
      email: 'moderator@example.com',
      permission: PermissionLevel.MODERATOR,
      business_unit_ids: ['unit-1'],
      business_unit_names: ['Test Unit'],
    },
    isLoading: false,
  } as TestAuthConfig,

  loading: {
    isAuthenticated: false,
    user: null,
    isLoading: true,
  } as TestAuthConfig,
};

/**
 * Creates a query client with pre-populated auth data for testing.
 * This allows components using useUserPermissions to work correctly in tests.
 */
export function createAuthQueryClient(config: TestAuthConfig, baseClient?: QueryClient): QueryClient {
  const client = baseClient || new QueryClient({
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

  // Pre-populate the user-permissions query with mock data
  if (config.user) {
    const authUser = {
      user_id: config.user.user_id || 'test-user-id',
      email: config.user.email,
      permission: config.user.permission,
      business_unit_ids: config.user.business_unit_ids || [],
      business_unit_names: config.user.business_unit_names || [],
    };

    client.setQueryData(authSessionQueryKey, authUser);
    client.setQueryData(['user-permissions'], authUser);
  } else {
    // Clear any existing auth data for guest state
    client.removeQueries({ queryKey: authSessionQueryKey });
    client.removeQueries({ queryKey: ['user-permissions'] });
  }

  return client;
}

/**
 * Test Auth Provider that provides mock authentication state.
 * Pre-populates the QueryClient with user permissions data so hooks like
 * useUserPermissions and useAuth work correctly in tests.
 */
export function TestAuth({ children, config = mockUsers.user, queryClient }: TestAuthProps) {
  const client = React.useMemo(
    () => createAuthQueryClient(config, queryClient),
    [config, queryClient]
  );

  return React.createElement(QueryClientProvider, { client }, children);
}

/**
 * Helper to create a custom auth config
 */
export function createAuthConfig(options: {
  email?: string;
  permission?: PermissionLevel | string;
  businessUnitIds?: Array<string>;
  isAuthenticated?: boolean;
}): TestAuthConfig {
  const { email = 'test@example.com', permission = PermissionLevel.USER, businessUnitIds = [], isAuthenticated = true } = options;

  if (!isAuthenticated) {
    return mockUsers.guest;
  }

  return {
    isAuthenticated: true,
    user: {
      user_id: `test-${permission.toLowerCase()}-id`,
      email,
      permission,
      business_unit_ids: businessUnitIds,
      business_unit_names: businessUnitIds.map((id) => `Unit ${id}`),
    },
    isLoading: false,
  };
}

export default TestAuth;
