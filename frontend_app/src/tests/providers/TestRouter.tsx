import * as React from 'react';
import {
  Outlet,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

/**
 * Props for the TestRouter component
 */
export interface TestRouterProps {
  children: React.ReactNode;
  /** Initial route path (defaults to '/') */
  initialPath?: string;
  /** Custom routes configuration */
  routes?: Array<{ path: string; component?: () => React.ReactElement }>;
}

/**
 * Creates a test router with mock routes for testing components
 * that use TanStack Router hooks (useNavigate, useRouter, etc.)
 */
export function createTestRouter(options?: {
  initialPath?: string;
  routes?: Array<{ path: string; component?: () => React.ReactElement }>;
}) {
  const { initialPath = '/', routes = [] } = options || {};

  // Create a root route that renders children
  const rootRoute = createRootRoute({
    component: () => React.createElement(Outlet),
  });

  // Create index route and any additional routes
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => React.createElement('div', { 'data-testid': 'test-route-index' }, 'Test Index'),
  });

  // Create additional routes from configuration
  const additionalRoutes = routes.map((routeConfig) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: routeConfig.path,
      component: routeConfig.component || (() => 
        React.createElement('div', { 'data-testid': `test-route-${routeConfig.path}` }, `Test ${routeConfig.path}`)
      ),
    })
  );

  // Create catch-all route for testing navigation
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => React.createElement('div', { 'data-testid': 'test-route-catchall' }, 'Catch All'),
  });

  // Build route tree
  const routeTree = rootRoute.addChildren([indexRoute, ...additionalRoutes, catchAllRoute]);

  // Create memory history for testing
  const memoryHistory = createMemoryHistory({
    initialEntries: [initialPath],
  });

  // Create and return the router
  return createRouter({
    routeTree,
    history: memoryHistory,
  });
}

/**
 * Test Router Provider that wraps children with a mock TanStack Router context.
 * Provides useNavigate, useRouter, and other router hooks for testing.
 */
export function TestRouter({ children, initialPath = '/' }: TestRouterProps) {
  const testRouter = React.useMemo(
    () => {
      const rootRoute = createRootRoute({
        component: () => React.createElement(Outlet),
      });
      const renderChildren = () => React.createElement(React.Fragment, null, children);
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: renderChildren,
      });
      const catchAllRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '$',
        component: renderChildren,
      });
      const testRouteTree = rootRoute.addChildren([indexRoute, catchAllRoute]);
      const memoryHistory = createMemoryHistory({
        initialEntries: [initialPath],
      });

      return createRouter({
        routeTree: testRouteTree,
        history: memoryHistory,
      });
    },
    [children, initialPath]
  );

  return (
    <RouterContextProvider router={testRouter}>
      {children}
    </RouterContextProvider>
  );
}

/**
 * Hook to create a navigation spy for testing
 */
export function useNavigationSpy() {
  const navigateCalls = React.useRef<Array<{ to: string; options?: any }>>([]);

  const trackNavigation = React.useCallback((to: string, options?: any) => {
    navigateCalls.current.push({ to, options });
  }, []);

  const getNavigationHistory = React.useCallback(() => {
    return [...navigateCalls.current];
  }, []);

  const clearNavigationHistory = React.useCallback(() => {
    navigateCalls.current = [];
  }, []);

  return {
    trackNavigation,
    getNavigationHistory,
    clearNavigationHistory,
  };
}

export default TestRouter;
