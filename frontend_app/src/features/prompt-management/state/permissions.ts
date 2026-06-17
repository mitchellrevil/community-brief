import type { Category, Prompt } from "./types";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";

interface UserPermissions {
  permission?: PermissionLevel;
  business_unit_ids?: Array<string>;
}

/**
 * Check if user is an admin
 */
export function isAdmin(user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  return hasPermissionLevel(user.permission as PermissionLevel, PermissionLevel.ADMIN);
}

/**
 * Check if user has editor access
 */
export function isEditor(user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  return hasPermissionLevel(user.permission as PermissionLevel, PermissionLevel.EDITOR);
}

/**
 * Get user's business unit IDs
 */
function getUserBusinessUnitIds(user: UserPermissions | null | undefined): Array<string> {
  if (!user) return [];
  return user.business_unit_ids ?? [];
}

/**
 * Check if user can access a category (view/edit based on BU)
 */
export function canAccessCategory(category: Category, user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  
  const userBuIds = getUserBusinessUnitIds(user);
  if (userBuIds.length === 0) return false;

  // Check if category belongs to user's BU
  return (
    userBuIds.includes(category.id) ||
    (category.business_unit_id != null && userBuIds.includes(category.business_unit_id)) ||
    (category.parent_category_id != null && userBuIds.includes(category.parent_category_id))
  );
}

/**
 * Check if user can access a prompt (view/edit based on BU)
 */
export function canAccessPrompt(prompt: Prompt, user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  
  const userBuIds = getUserBusinessUnitIds(user);
  if (userBuIds.length === 0) return false;

  // Check if prompt belongs to user's BU
  return (
    (prompt.business_unit_id != null && userBuIds.includes(prompt.business_unit_id)) ||
    userBuIds.includes(prompt.category_id)
  );
}

/**
 * Check if user can edit a prompt
 */
export function canEditPrompt(prompt: Prompt, user: UserPermissions | null | undefined): boolean {
  if (!isEditor(user)) return false;
  return canAccessPrompt(prompt, user);
}

/**
 * Check if user can create a subfolder under a category
 * Only at root level (depth 0) and must have access
 */
export function canCreateSubfolder(
  category: Category,
  depth: number,
  user: UserPermissions | null | undefined
): boolean {
  if (!isEditor(user)) return false;
  if (depth !== 0) return false; // Only root level can have subfolders
  return canAccessCategory(category, user);
}

/**
 * Check if user can create a prompt in a category
 */
export function canCreatePromptIn(category: Category, user: UserPermissions | null | undefined): boolean {
  if (!isEditor(user)) return false;
  return canAccessCategory(category, user);
}

/**
 * Check if user can edit a category
 */
export function canEditCategory(category: Category, user: UserPermissions | null | undefined): boolean {
  if (!isEditor(user)) return false;
  return canAccessCategory(category, user);
}

/**
 * Check if user can delete a category
 */
export function canDeleteCategory(_category: Category, user: UserPermissions | null | undefined): boolean {
  return hasPermissionLevel(user?.permission as PermissionLevel, PermissionLevel.ADMIN);
}

/**
 * Check if user can delete a prompt
 */
export function canDeletePrompt(prompt: Prompt, user: UserPermissions | null | undefined): boolean {
  return canEditPrompt(prompt, user);
}

/**
 * Check if user can drag prompts
 */
export function canDragPrompt(prompt: Prompt, user: UserPermissions | null | undefined): boolean {
  return canEditPrompt(prompt, user);
}

/**
 * Check if user can toggle prompt visibility
 */
export function canTogglePromptVisibility(prompt: Prompt, user: UserPermissions | null | undefined): boolean {
  return canEditPrompt(prompt, user);
}
