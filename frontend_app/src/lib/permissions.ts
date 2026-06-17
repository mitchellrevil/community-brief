/**
 * Frontend permission utilities for permission level-based access control
 */
import { 
  PermissionLevel, 
  hasPermissionLevel as typeHasPermissionLevel,
} from '../types/permissions';

export interface User {
  id: string;
  permission: PermissionLevel;
  email?: string;
  name?: string;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
}

export interface Resource {
  id: string;
  user_id: string;
  shared_with?: Array<{
    user_id: string;
    permission_level?: PermissionLevel;
  }>;
}

/**
 * Check if a user has a specific permission level or higher
 */
export function hasPermissionLevel(
  userLevel: PermissionLevel, 
  requiredLevel: PermissionLevel
): boolean {
  return typeHasPermissionLevel(userLevel, requiredLevel);
}

/**
 * Check if a user has access to a resource
 */
export function checkResourceAccess(
  resource?: Resource,
  user?: User,
  requiredPermission: PermissionLevel = PermissionLevel.USER
): boolean {
  if (!resource || !user) return false;
  
  // Check if user is an admin (system-level access)
  if (hasPermissionLevel(user.permission, PermissionLevel.ADMIN)) {
    return true;
  }
  
  // Check if user is the owner/creator
  if (resource.user_id === user.id) {
    return true;
  }
  
  // Check shared permissions
  // Shared_with can be undefined at runtime; keep conditional as a runtime guard
   
   
  if (resource.shared_with) {
    const userShare = resource.shared_with.find(share => share.user_id === user.id);
     
    if (userShare && userShare.permission_level) {
      return hasPermissionLevel(userShare.permission_level, requiredPermission);
    }
  }
  
  return false;
}

/**
 * Get the user's effective permission level for a specific resource
 */
export function getUserResourcePermissionLevel(
  resource?: Resource,
  user?: User
): PermissionLevel | null {
  if (!resource || !user) return null;
  
  // System administrators have full access
  if (hasPermissionLevel(user.permission, PermissionLevel.ADMIN)) {
    return PermissionLevel.ADMIN;
  }
  
  // Check if user is the owner/creator
  if (resource.user_id === user.id) {
    return user.permission;
  }
  
  // Check shared permissions
   
   
  if (resource.shared_with) {
    const userShare = resource.shared_with.find(share => share.user_id === user.id);
     
    if (userShare && userShare.permission_level) {
      return userShare.permission_level;
    }
  }
  
  return null; // No access
}

/**
 * Check if user can perform an action based on permission level
 */
export function canPerformAction(
  userPermission: PermissionLevel,
  requiredPermission: PermissionLevel
): boolean {
  return hasPermissionLevel(userPermission, requiredPermission);
}

/**
 * Get a display-friendly permission level name
 */
export function getPermissionDisplayName(permission: PermissionLevel): string {
  const names: Record<PermissionLevel, string> = {
    [PermissionLevel.USER]: 'User',
    [PermissionLevel.EDITOR]: 'Editor',
    [PermissionLevel.ADMIN]: 'Administrator',
    [PermissionLevel.MODERATOR]: 'Moderator',
  };
  return names[permission] || permission;
}

/**
 * Get permission level description
 */
export function getPermissionDescription(permission: PermissionLevel): string {
  const descriptions: Record<PermissionLevel, string> = {
    [PermissionLevel.USER]: 'Basic access to personal resources and transcriptions',
    [PermissionLevel.EDITOR]: 'Can create and edit content, view analytics',
    [PermissionLevel.ADMIN]: 'Full system access, user management, and configuration',
    [PermissionLevel.MODERATOR]: 'Highest level access for system moderation and oversight',
  };
  return descriptions[permission] || 'Unknown permission level';
}

