// Permission level-based access control system for Community Brief

export enum PermissionLevel {
  USER = "User",
  EDITOR = "Editor",
  ADMIN = "Admin",
  MODERATOR = "Moderator",
}

// Permission hierarchy (higher number = more permissions)
export const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  [PermissionLevel.USER]: 1,
  [PermissionLevel.EDITOR]: 2,
  [PermissionLevel.ADMIN]: 3,
  [PermissionLevel.MODERATOR]: 4,
};

/**
 * Check if a user has a specific permission level or higher
 */
export function hasPermissionLevel(
  userPermission: PermissionLevel,
  requiredPermission: PermissionLevel
): boolean {
  const userLevel = PERMISSION_HIERARCHY[userPermission] || 0;
  const requiredLevel = PERMISSION_HIERARCHY[requiredPermission] || 0;
  return userLevel >= requiredLevel;
}
