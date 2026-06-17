import { useAuthSession } from "@/features/auth/hooks/useAuthSession";

/**
 * Hook to access authentication status using cookie-based sessions.
 *
 * This hook provides a simple interface for checking user authentication state
 * without exposing token management details. The actual authentication is handled
 * via HTTP-only cookies set by the backend.
 *
 * @description Checks if the current user is authenticated by verifying
 * if user permissions can be fetched from the API.
 *
 * @returns Authentication state object
 * @returns {string} token - Empty string (token is managed via HTTP-only cookies)
 * @returns {boolean} isAuthenticated - True if user permissions exist
 * @returns {boolean} isLoading - True while checking authentication status
 *
 * @example
 * ```tsx
 * import { useAuth } from '@/hooks/useAuth';
 *
 * function ProtectedComponent() {
 *   const { isAuthenticated, isLoading } = useAuth();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!isAuthenticated) return <Navigate to="/login" />;
 *
 *   return <div>Protected content</div>;
 * }
 * ```
 *
 * @see {@link useUserPermissions} for permission-level access
 */
export function useAuth() {
  const { isAuthenticated, isLoading } = useAuthSession();

  return {
    token: "",
    isAuthenticated,
    isLoading,
  };
}
