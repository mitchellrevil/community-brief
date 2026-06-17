// Permission-based React Hook - Pure permission level system
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AuthSessionUser } from "@/features/auth/data/types";
import { getAuthSessionQuery } from "@/features/auth/data/queries";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { getPermissionStats, getUserPermissions, getUsersByPermission, updateUserPermissionApi } from "@/shared/data/permissions/api";
import { 
  PermissionLevel,
  hasPermissionLevel,
} from "@/types/permissions";

/**
 * Normalized user data for frontend consumption.
 */
export type FrontendUser = AuthSessionUser;

/**
 * Permission statistics for admin dashboard.
 */
interface PermissionStats {
  total_users: number;
  by_permission: Record<PermissionLevel, number>;
}

/**
 * Hook to fetch the current user's permissions from the API.
 *
 * Fetches and caches user permission data with a 5-minute stale time.
 * This is the foundational hook for all permission-based access control.
 *
 * @returns TanStack Query result with FrontendUser data
 *
 * @example
 * ```tsx
 * import { useUserPermissions } from '@/hooks/usePermissions';
 *
 * function ProfileHeader() {
 *   const { data: user, isLoading, error } = useUserPermissions();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorDisplay error={error} />;
 *
 *   return (
 *     <div>
 *       <span>{user.email}</span>
 *       <Badge>{user.permission}</Badge>
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link usePermissionGuard} for computed permission checks
 * @see {@link PermissionLevel} for available permission levels
 */
export const useUserPermissions = () => {
  return useQuery<FrontendUser | null>({
    ...getAuthSessionQuery(),
  });
};

/**
 * Hook for fetching permission statistics (Admin only).
 *
 * Provides aggregated permission data for admin dashboards.
 * Only enabled for users with ADMIN permission level.
 *
 * @returns TanStack Query result with PermissionStats data
 *
 * @example
 * ```tsx
 * import { usePermissionStats } from '@/hooks/usePermissions';
 *
 * function AdminDashboard() {
 *   const { data: stats, isLoading } = usePermissionStats();
 *
 *   return (
 *     <div>
 *       <h3>Total Users: {stats?.total_users}</h3>
 *       <p>Admins: {stats?.by_permission.ADMIN}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export const usePermissionStats = () => {
  const { data: userPermissions } = useUserPermissions();
  
  return useQuery<PermissionStats>({
    queryKey: ['permission-stats'],
    queryFn: getPermissionStats,
    enabled: userPermissions ? hasPermissionLevel(userPermissions.permission, PermissionLevel.ADMIN) : false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook for fetching users by permission level (Admin only).
 *
 * @param {PermissionLevel} permissionLevel - The permission level to filter by
 * @param {number} [limit=100] - Maximum number of users to return
 *
 * @returns TanStack Query result with array of users
 *
 * @example
 * ```tsx
 * import { useUsersByPermission } from '@/hooks/usePermissions';
 * import { PermissionLevel } from '@/types/permissions';
 *
 * function AdminUserList() {
 *   const { data: admins } = useUsersByPermission(PermissionLevel.ADMIN);
 *
 *   return admins?.map((admin) => <UserRow key={admin.id} user={admin} />);
 * }
 * ```
 */
export const useUsersByPermission = (permissionLevel: PermissionLevel, limit: number = 100) => {
  const { data: userPermissions } = useUserPermissions();
  
  return useQuery({
    queryKey: ['users-by-permission', permissionLevel, limit],
    queryFn: () => getUsersByPermission(permissionLevel, limit),
    enabled: userPermissions ? hasPermissionLevel(userPermissions.permission, PermissionLevel.ADMIN) : false,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Mutation hook for updating a user's permission level.
 *
 * Automatically invalidates related queries on success.
 *
 * @returns TanStack Mutation for permission updates
 *
 * @example
 * ```tsx
 * import { useUpdateUserPermission } from '@/hooks/usePermissions';
 *
 * function PermissionEditor({ userId }: { userId: string }) {
 *   const updatePermission = useUpdateUserPermission();
 *
 *   const handleChange = (newLevel: PermissionLevel) => {
 *     updatePermission.mutate({ userId, newPermission: newLevel });
 *   };
 *
 *   return <PermissionSelect onChange={handleChange} />;
 * }
 * ```
 */
export const useUpdateUserPermission = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, newPermission }: { userId: string; newPermission: PermissionLevel }) => 
      updateUserPermissionApi(userId, newPermission),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['users-by-permission'] });
      queryClient.invalidateQueries({ queryKey: ['permission-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
  });
};

/**
 * Hook providing computed permission checks and user information.
 *
 * Returns a comprehensive guard object with methods for checking permissions,
 * common permission shortcuts, and current user information.
 *
 * @returns Permission guard object with check methods and user data
 * @returns {Function} hasPermissionLevel - Check if user has required permission
 * @returns {Function} isAdmin - Check if user is admin
 * @returns {Function} isEditor - Check if user is editor or above
 * @returns {boolean} canViewUsers - Whether user can view user list
 * @returns {boolean} canManageSystem - Whether user can access system settings
 * @returns {string} currentPermission - User's current permission level
 * @returns {string} userEmail - User's email address
 * @returns {boolean} isLoading - Whether permissions are loading
 *
 * @example
 * ```tsx
 * import { usePermissionGuard } from '@/hooks/usePermissions';
 *
 * function AdminPanel() {
 *   const guard = usePermissionGuard();
 *
 *   if (guard.isLoading) return <Spinner />;
 *   if (!guard.isAdmin()) return <AccessDenied />;
 *
 *   return (
 *     <div>
 *       <h1>Admin Panel</h1>
 *       <p>Welcome, {guard.userEmail}</p>
 *       {guard.canViewUsers && <UserManagement />}
 *       {guard.canManageSystem && <SystemSettings />}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useUserPermissions} for raw permission data
 * @see {@link PermissionLevel} for available levels
 */
export const usePermissionGuard = () => {
  const { user: userPermissions, isLoading, error } = useAuthSession();
  
  const guard = useMemo(() => {
    const permission = userPermissions?.permission ?? null;
    
    return {
      // Direct permission level checks
      hasPermissionLevel: (required: PermissionLevel) =>
        permission ? hasPermissionLevel(permission, required) : false,
      isAdmin: () => (permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false),
      isEditor: () => (permission ? hasPermissionLevel(permission, PermissionLevel.EDITOR) : false),
      isUser: () => (permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false),
      isModerator: () => (permission ? hasPermissionLevel(permission, PermissionLevel.MODERATOR) : false),
      
      // Specific permission shortcuts
      canViewTranscriptions: permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false,
      canCreateTranscriptions: permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false,
      canEditTranscriptions: permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false,
      canDeleteTranscriptions: permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false,
      
      canViewUsers: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      canCreateUsers: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      canEditUsers: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      canDeleteUsers: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      
      canViewSettings: permission ? hasPermissionLevel(permission, PermissionLevel.USER) : false,
      canEditSettings: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      
      canManageSystem: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      canViewAnalytics: permission ? hasPermissionLevel(permission, PermissionLevel.EDITOR) : false,
      canViewAllAnalytics: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      
      canExportData: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      canImportData: permission ? hasPermissionLevel(permission, PermissionLevel.ADMIN) : false,
      
      // User info
      currentPermission: permission,
      userEmail: userPermissions?.email,
      userId: userPermissions?.user_id,
      businessUnitIds: userPermissions?.business_unit_ids || [],
      businessUnitNames: userPermissions?.business_unit_names || [],
      
      // Business Unit Check
      hasNoBusinessUnit: userPermissions ? (
        !userPermissions.business_unit_ids || userPermissions.business_unit_ids.length === 0
      ) : false,
      
      // Loading state
      isLoading,
      error,
    };
  }, [userPermissions, isLoading, error]);
  
  return guard;
};

/**
 * Hook for conditional rendering based on permission levels.
 *
 * Provides convenience methods for rendering components conditionally
 * based on user permissions. Combines permission checking with React
 * rendering patterns.
 *
 * @returns Conditional render helpers and permission guard
 * @returns {Function} showForPermission - Render component only for specific permission
 * @returns {Function} showForAdmin - Render component only for admins
 * @returns {Function} showForEditor - Render component for editors and above
 *
 * @example
 * ```tsx
 * import { useConditionalRender } from '@/hooks/usePermissions';
 *
 * function Dashboard() {
 *   const { showForAdmin, showForEditor, isLoading } = useConditionalRender();
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return (
 *     <div>
 *       <h1>Dashboard</h1>
 *       {showForEditor(<AnalyticsWidget />)}
 *       {showForAdmin(<UserManagementWidget />)}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link usePermissionGuard} for the underlying permission checks
 */
export const useConditionalRender = () => {
  const guard = usePermissionGuard();
  
  return {
    // Show component only for specific permission level
    showForPermission: (requiredPermission: PermissionLevel, component: React.ReactNode) => {
      return guard.hasPermissionLevel(requiredPermission) ? component : null;
    },
    
    // Show component only for admin
    showForAdmin: (component: React.ReactNode) => {
      return guard.isAdmin() ? component : null;
    },
    
    // Show component only for editor or above
    showForEditor: (component: React.ReactNode) => {
      return guard.hasPermissionLevel(PermissionLevel.EDITOR) ? component : null;
    },
    
    ...guard,
  };
};

/**
 * Returns a Tailwind CSS class string for styling permission badges.
 *
 * @param {PermissionLevel} permission - The permission level to style
 * @returns {string} Tailwind CSS classes for badge styling
 *
 * @example
 * ```tsx
 * import { getPermissionBadgeColor } from '@/hooks/usePermissions';
 *
 * function PermissionBadge({ permission }: { permission: PermissionLevel }) {
 *   return (
 *     <span className={`px-2 py-1 rounded ${getPermissionBadgeColor(permission)}`}>
 *       {permission}
 *     </span>
 *   );
 * }
 * ```
 */
export const getPermissionBadgeColor = (permission: PermissionLevel): string => {
  switch (permission) {
    case PermissionLevel.ADMIN:
      return 'bg-red-100 text-red-800 border-red-200';
    case PermissionLevel.MODERATOR:
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case PermissionLevel.EDITOR:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case PermissionLevel.USER:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

/**
 * Returns an emoji icon for a permission level.
 *
 * @param {PermissionLevel} permission - The permission level
 * @returns {string} Emoji representing the permission level
 *
 * @example
 * ```tsx
 * import { getPermissionIcon } from '@/hooks/usePermissions';
 *
 * function UserRow({ user }: { user: User }) {
 *   return (
 *     <tr>
 *       <td>{getPermissionIcon(user.permission)} {user.email}</td>
 *     </tr>
 *   );
 * }
 * ```
 */
export const getPermissionIcon = (permission: PermissionLevel): string => {
  switch (permission) {
    case PermissionLevel.ADMIN:
      return '👑'; // Crown
    case PermissionLevel.MODERATOR:
      return '🛡️'; // Shield
    case PermissionLevel.EDITOR:
      return '✏️'; // Pencil
    case PermissionLevel.USER:
      return '👤'; // User
    default:
      return '❓'; // Question mark
  }
};
