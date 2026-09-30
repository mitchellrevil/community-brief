from enum import Enum
from typing import Dict, Any
from typing import List

class PermissionLevel(str, Enum):
    """Permission levels in hierarchical order"""
    PUBLIC = "Public"
    USER = "User"
    EDITOR = "Editor"
    ADMIN = "Admin"
    MODERATOR = "Moderator"

    def __str__(self):
        return str(self.value)

# Permission hierarchy (higher number = more permissions)
PERMISSION_HIERARCHY = {
    PermissionLevel.PUBLIC.value: 0,    # Public
    PermissionLevel.USER.value: 0,      # User (baseline)
    PermissionLevel.EDITOR.value: 50,   # Editor
    PermissionLevel.ADMIN.value: 100,   # Admin
    PermissionLevel.MODERATOR.value: 150,# Moderator (highest)
}

# Normalized permission hierarchy lookup (lower-case keys) to allow
# case-insensitive permission checks without altering the canonical
# enum values used across the codebase.
_PERMISSION_HIERARCHY_LOWER = {k.casefold(): v for k, v in PERMISSION_HIERARCHY.items()}

def normalize_permission(permission_string: str | None) -> str | None:
    """Return a normalized, casefolded permission string suitable for lookups.

    Returns None if the string is blank or falsy.
    """
    if not permission_string:
        return None
    return str(permission_string).strip().casefold()


def get_permission_level(permission_string: str) -> int:
    """
    Get the numeric level for a permission string.
    
    Args:
        permission_string: The permission level as a string (e.g., 'Admin', 'Editor', 'User')
    
    Returns:
        int: The numeric permission level (1-3), or 0 if invalid
    """
    normalized = normalize_permission(permission_string)
    if normalized is None:
        return 0
    # use a lower-cased lookup to avoid title-casing or locale issues
    return _PERMISSION_HIERARCHY_LOWER.get(normalized, 0)

def has_permission_level(user_permission: str, required_permission: str) -> bool:
    """
    Check if a user has the required permission level or higher.
    
    Args:
        user_permission: The user's permission level string
        required_permission: The required permission level string
    
    Returns:
        bool: True if user has sufficient permissions, False otherwise
    """
    # Case-insensitive comparison
    user_level = get_permission_level(user_permission)
    required_level = get_permission_level(required_permission)
    return user_level >= required_level


# PermissionLevel + PERMISSION_HIERARCHY numeric values.
