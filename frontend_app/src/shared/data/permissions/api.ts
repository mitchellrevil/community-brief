import { httpClient } from "@/shared/api/client/httpClient";
import {
  MY_PERMISSIONS_API,
  PERMISSION_STATS_API,
  USERS_BY_PERMISSION_API,
  USER_PERMISSIONS_API,
} from "@/shared/api/constants";

/**
 * Fetches the current user's permissions.
 *
 * Returns permission data for the authenticated user including
 * permission level, business unit assignments, and user identifiers.
 *
 * @returns {Promise<Object>} User permission data
 *
 * @throws {ApiError} When the API request fails
 * @throws {Error} When response is empty or malformed
 *
 * @example
 * ```tsx
 * import { getUserPermissions } from '@/shared/data/permissions/api';
 *
 * const permissions = await getUserPermissions();
 * console.log(`Permission level: ${permissions.permission}`);
 * console.log(`User ID: ${permissions.user_id}`);
 * ```
 *
 * @see {@link useUserPermissions} for the React hook wrapper
 */
export async function getUserPermissions() {
  const response = await httpClient.get(MY_PERMISSIONS_API);
  const result = response.data;

  if (result == null) throw new Error('Empty response from permissions endpoint');
  if (typeof result === 'object' && (result.status === 200 || result.status === '200') && result.data) return result.data;
  if (typeof result === 'object' && (result.user_id || result.userId || result.email)) return result;
  if (typeof result === 'object' && result.status === 200) {
    if ((result).data) return (result).data;
    const { status, ...rest } = result;
    if (rest && (rest.user_id || rest.email)) return rest;
    if (rest && (rest.permission_level)) return rest;
  }

  throw new Error(result.message || 'Failed to fetch user permissions');
}

/**
 * Fetches aggregated permission statistics.
 *
 * Returns total user counts and breakdowns by permission level.
 * Requires admin permissions.
 *
 * @returns {Promise<Object>} Permission statistics
 *
 * @throws {ApiError} When request fails or user lacks admin access
 *
 * @example
 * ```tsx
 * import { getPermissionStats } from '@/shared/data/permissions/api';
 *
 * const stats = await getPermissionStats();
 * console.log(`Total users: ${stats.total_users}`);
 * console.log(`Admins: ${stats.by_permission.ADMIN}`);
 * ```
 */
export async function getPermissionStats() {
  const response = await httpClient.get(PERMISSION_STATS_API);
  const result = response.data;

  if (result == null) throw new Error('Empty response from permission-stats endpoint');
  if (typeof result === 'object' && (result.status === 200 || result.status === '200') && result.data) return result.data;
  if (typeof result === 'object' && (result.total_users || result.by_permission)) return result;
  throw new Error(result.message || 'Failed to fetch permission statistics');
}

/**
 * Fetches users filtered by permission level.
 *
 * Returns a list of users that have the specified permission level.
 * Requires admin permissions.
 *
 * @param {string} permissionLevel - Permission level to filter by (USER, EDITOR, MODERATOR, ADMIN)
 * @param {number} [limit=100] - Maximum number of users to return
 *
 * @returns {Promise<Array>} Array of user objects
 *
 * @throws {ApiError} When request fails or user lacks admin access
 *
 * @example
 * ```tsx
 * import { getUsersByPermission } from '@/shared/data/permissions/api';
 *
 * const editors = await getUsersByPermission('EDITOR', 50);
 * editors.forEach((user) => console.log(user.email));
 * ```
 */
export async function getUsersByPermission(permissionLevel: string, limit: number = 100) {
  const response = await httpClient.get(USERS_BY_PERMISSION_API(permissionLevel), {
    params: { limit },
  });
  const result = response.data;

  if (result == null) throw new Error('Empty response from by-permission endpoint');
  if (typeof result === 'object' && (result.status === 200 || result.status === '200') && result.data) return result.data;
  if (Array.isArray(result)) return result;
  if (typeof result === 'object' && result.users) return result.users;
  throw new Error(result.message || 'Failed to fetch users by permission');
}

/**
 * Updates a user's permission level.
 *
 * Changes the permission level for a specified user.
 * Requires admin permissions.
 *
 * @param {string} userId - The user's unique identifier
 * @param {string} newPermission - New permission level (USER, EDITOR, MODERATOR, ADMIN)
 *
 * @returns {Promise<Object>} Updated user data
 *
 * @throws {ApiError} When request fails or user lacks admin access
 *
 * @example
 * ```tsx
 * import { updateUserPermissionApi } from '@/shared/data/permissions/api';
 *
 * await updateUserPermissionApi('user-123', 'EDITOR');
 * ```
 */
export async function updateUserPermissionApi(userId: string, newPermission: string) {
  const response = await httpClient.patch(USER_PERMISSIONS_API(userId), {
    permission: newPermission,
  });
  const result = response.data;
  
  if (result.status === 200) return result.data;
  return result;
}

export const fetchUserPermissions = getUserPermissions;
export const fetchPermissionStats = getPermissionStats;
export const fetchUsersByPermission = getUsersByPermission;
export const updateUserPermissionLevel = updateUserPermissionApi;

