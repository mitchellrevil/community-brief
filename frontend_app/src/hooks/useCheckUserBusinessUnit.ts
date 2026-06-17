import { useUserPermissions } from "./usePermissions";

/**
 * User permissions data structure returned from the API.
 */
export interface UserPermissions {
  /** Unique user identifier */
  user_id: string;
  /** User's email address */
  email: string;
  /** Permission level (USER, EDITOR, MODERATOR, ADMIN) */
  permission: string;
  /** Array of assigned business unit IDs */
  business_unit_ids?: Array<string>;
  /** Human-readable business unit names */
  business_unit_names?: Array<string>;
}

/**
 * Hook to check if the current user has a business unit assigned.
 *
 * Used to trigger the business unit selection dialog when a user first
 * logs in or when they have no business units assigned. This is important
 * for data segregation and access control.
 *
 * @description Fetches user permissions and determines if business unit
 * assignment is needed. Returns loading and error states for proper UX.
 *
 * @returns Business unit check result
 * @returns {UserPermissions | null} userPermissions - Current user's permissions or null
 * @returns {boolean} isLoading - True while fetching permissions
 * @returns {boolean} hasNoBusinessUnit - True if user needs to select a business unit
 * @returns {string | null} error - Error message if fetch failed
 *
 * @example
 * ```tsx
 * import { useCheckUserBusinessUnit } from '@/hooks/useCheckUserBusinessUnit';
 * import { BusinessUnitSelectionDialog } from '@/components/business-unit-selection-dialog';
 *
 * function AppLayout({ children }: { children: React.ReactNode }) {
 *   const { hasNoBusinessUnit, isLoading } = useCheckUserBusinessUnit();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <>
 *       {children}
 *       <BusinessUnitSelectionDialog open={hasNoBusinessUnit} />
 *     </>
 *   );
 * }
 * ```
 *
 * @see {@link useUserPermissions} for the underlying permissions hook
 */
export function useCheckUserBusinessUnit() {
  // Use the React Query hook which handles caching and deduplication
  const { data: userPermissions, isLoading, error } = useUserPermissions();

  // Check if user has no business units assigned
  const hasNoBusinessUnit = userPermissions ? (
    !userPermissions.business_unit_ids || userPermissions.business_unit_ids.length === 0
  ) : false;

  return { 
    userPermissions: (userPermissions ?? null) as UserPermissions | null, 
    isLoading, 
    hasNoBusinessUnit, 
    error: error instanceof Error ? error.message : null 
  };
}
