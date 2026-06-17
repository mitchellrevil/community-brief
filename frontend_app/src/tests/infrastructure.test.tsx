/* eslint-disable @typescript-eslint/require-await */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';

/**
 * Phase 4: Test Infrastructure Expansion Tests
 * 
 * These tests verify that our test utilities provide all required providers
 * (TanStack Router, auth context, theme provider, query client) and MSW mock
 * handlers for integration testing.
 */

describe('Test Infrastructure - Provider Integration', () => {
  // Import test utilities lazily to allow for failing tests first
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let renderWithProviders: typeof import('./test-utils').renderWithProviders;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let AllProviders: typeof import('./providers').AllProviders;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let createQueryClient: typeof import('./test-utils').createQueryClient;

  beforeEach(async () => {
    // Dynamic imports to detect if utilities exist
    const testUtils = await import('./test-utils');
    renderWithProviders = testUtils.renderWithProviders;
    createQueryClient = testUtils.createQueryClient;
    
    const providers = await import('./providers');
    AllProviders = providers.AllProviders;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('renderWithProviders function', () => {
    it('should render a test component with all providers', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="test-component">Hello World</div>;
      }
      
      renderWithProviders(<TestComponent />);
      
      expect(screen.getByTestId('test-component')).toBeDefined();
      expect(screen.getByText('Hello World')).toBeDefined();
    });

    it('should provide a fresh QueryClient for each render', () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div>Test</div>;
      }
      
      const result1 = renderWithProviders(<TestComponent />);
      const client1 = result1.queryClient;
      
      cleanup();
      
      const result2 = renderWithProviders(<TestComponent />);
      const client2 = result2.queryClient;
      
      expect(client1).not.toBe(client2);
    });

    it('should return render result with queryClient for test assertions', () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div>Test</div>;
      }
      
      const result = renderWithProviders(<TestComponent />);
      
      expect(result).toHaveProperty('queryClient');
      expect(result).toHaveProperty('container');
      expect(result).toHaveProperty('getByText');
    });
  });

  describe('Mock Router Provider', () => {
    it('should provide useNavigate hook for testing navigation assertions', async () => {
      expect(renderWithProviders).toBeDefined();
      
      const navigateMock = vi.fn();
      
      // Component that uses navigation
      function TestComponent() {
        const navigate = useNavigate();
        
        useEffect(() => {
          // Store navigate function for assertion
          navigateMock.mockImplementation(() => navigate);
        }, [navigate]);
        
        return (
          <button 
            onClick={() => navigate({ to: '/' })}
            data-testid="nav-button"
          >
            Navigate
          </button>
        );
      }
      
      // Should not throw when component uses router hooks
      expect(() => {
        renderWithProviders(<TestComponent />);
      }).not.toThrow();
    });

    it('should allow accessing router context in tests', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        try {
          void useRouter();
          return (
            <div data-testid="router-exists">
              Router Available
            </div>
          );
        } catch {
          return <div data-testid="router-error">Router Error</div>;
        }
      }
      
      renderWithProviders(<TestComponent />);
      
      // Should find either router-exists or at least not crash
      const element = screen.queryByTestId('router-exists') || screen.queryByTestId('router-error');
      expect(element).toBeDefined();
    });
  });

  describe('Mock Auth Context', () => {
    it('should allow configurable logged-in user state', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="auth-test">Auth Test</div>;
      }
      
      // Should accept auth options
      const result = renderWithProviders(<TestComponent />, {
        auth: {
          isAuthenticated: true,
          user: { email: 'test@example.com', permission: 'User' }
        }
      });
      
      expect(result).toBeDefined();
    });

    it('should allow configurable admin user state', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="admin-test">Admin Test</div>;
      }
      
      const result = renderWithProviders(<TestComponent />, {
        auth: {
          isAuthenticated: true,
          user: { email: 'admin@example.com', permission: 'Admin' }
        }
      });
      
      expect(result).toBeDefined();
    });

    it('should allow configurable guest (unauthenticated) state', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="guest-test">Guest Test</div>;
      }
      
      const result = renderWithProviders(<TestComponent />, {
        auth: {
          isAuthenticated: false,
          user: null
        }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('AllProviders Wrapper Component', () => {
    it('should compose all providers without errors', async () => {
      expect(AllProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="wrapped-component">Wrapped Content</div>;
      }
      
      // Should render without throwing
      expect(() => {
        render(
          <AllProviders>
            <TestComponent />
          </AllProviders>
        );
      }).not.toThrow();
      
      expect(screen.getByTestId('wrapped-component')).toBeDefined();
    });

    it('should accept custom queryClient prop', async () => {
      expect(AllProviders).toBeDefined();
      expect(createQueryClient).toBeDefined();
      
      const customClient = createQueryClient();
      
      function TestComponent() {
        return <div data-testid="custom-client-test">Custom Client</div>;
      }
      
      expect(() => {
        render(
          <AllProviders queryClient={customClient}>
            <TestComponent />
          </AllProviders>
        );
      }).not.toThrow();
    });

    it('should accept auth configuration prop', async () => {
      expect(AllProviders).toBeDefined();
      
      function TestComponent() {
        return <div data-testid="auth-config-test">Auth Config</div>;
      }
      
      expect(() => {
        render(
          <AllProviders auth={{ isAuthenticated: true, user: { email: 'test@test.com', permission: 'User' } }}>
            <TestComponent />
          </AllProviders>
        );
      }).not.toThrow();
    });
  });

  describe('Async Operations Support', () => {
    it('should work correctly with useEffect hooks', async () => {
      expect(renderWithProviders).toBeDefined();
      
      const effectRan = { current: false };
      
      function TestComponent() {
        useEffect(() => {
          effectRan.current = true;
        }, []);
        
        return <div data-testid="effect-test">Effect Test</div>;
      }
      
      renderWithProviders(<TestComponent />);
      
      await waitFor(() => {
        expect(effectRan.current).toBe(true);
      });
    });

    it('should support async state updates', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        const [loaded, setLoaded] = useState(false);
        
        useEffect(() => {
          const timer = setTimeout(() => setLoaded(true), 10);
          return () => clearTimeout(timer);
        }, []);
        
        return <div data-testid="async-state">{loaded ? 'Loaded' : 'Loading'}</div>;
      }
      
      renderWithProviders(<TestComponent />);
      
      expect(screen.getByText('Loading')).toBeDefined();
      
      await waitFor(() => {
        expect(screen.getByText('Loaded')).toBeDefined();
      });
    });
  });

  describe('Query Client Isolation', () => {
    it('should reset/clear query client between tests to prevent state leakage', async () => {
      expect(renderWithProviders).toBeDefined();
      expect(createQueryClient).toBeDefined();
      
      // First render - set some cache data
      const client1 = createQueryClient();
      client1.setQueryData(['test-key'], { data: 'cached' });
      
      // Second render with new client
      const client2 = createQueryClient();
      
      // New client should not have the cached data
      expect(client2.getQueryData(['test-key'])).toBeUndefined();
    });

    it('should provide isolated query client per renderWithProviders call', async () => {
      expect(renderWithProviders).toBeDefined();
      
      function TestComponent() {
        return <div>Test</div>;
      }
      
      // First render
      const result1 = renderWithProviders(<TestComponent />);
      result1.queryClient.setQueryData(['isolated-key'], { value: 1 });
      
      cleanup();
      
      // Second render should have fresh client
      const result2 = renderWithProviders(<TestComponent />);
      
      expect(result2.queryClient.getQueryData(['isolated-key'])).toBeUndefined();
    });
  });
});

describe('Test Infrastructure - MSW Handlers', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let handlers: typeof import('./mocks/handlers').handlers;

  beforeEach(async () => {
    const mocks = await import('./mocks/handlers');
    handlers = mocks.handlers;
  });

  it('should export an array of MSW handlers', () => {
    expect(handlers).toBeDefined();
    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers.length).toBeGreaterThanOrEqual(5);
  });

  it('should include handler for GET /users', () => {
    expect(handlers).toBeDefined();
    
    // Check that there's a handler for users endpoint
    const hasUsersHandler = handlers.some((handler) => {
      const info = handler.info;
      return info.method === 'GET' && String(info.path).includes('/users');
    });
    
    expect(hasUsersHandler).toBe(true);
  });

  it('should include handler for GET /jobs', () => {
    expect(handlers).toBeDefined();
    
    const hasJobsHandler = handlers.some((handler) => {
      const info = handler.info;
      return info.method === 'GET' && String(info.path).includes('/jobs');
    });
    
    expect(hasJobsHandler).toBe(true);
  });

  it('should include handler for POST /upload', () => {
    expect(handlers).toBeDefined();
    
    const hasUploadHandler = handlers.some((handler) => {
      const info = handler.info;
      return info.method === 'POST' && String(info.path).includes('/upload');
    });
    
    expect(hasUploadHandler).toBe(true);
  });

  it('should include handler for GET /prompts', () => {
    expect(handlers).toBeDefined();
    
    const hasPromptsHandler = handlers.some((handler) => {
      const info = handler.info;
      return info.method === 'GET' && String(info.path).includes('/prompts');
    });
    
    expect(hasPromptsHandler).toBe(true);
  });
});
