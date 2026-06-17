from enum import Enum
from typing import Any, Dict, List, Optional, Set

from .permissions import PermissionLevel, has_permission_level


class PromptVisibility(str, Enum):
    """Prompt availability levels for runtime usage."""

    ALL = "all"
    ONLY_EDITORS = "only_editors"
    NOBODY = "nobody"


DEFAULT_PROMPT_VISIBILITY = PromptVisibility.ALL.value


def normalize_prompt_visibility(value: Optional[str]) -> str:
    """Normalize prompt visibility to the current runtime contract."""

    if not value:
        return DEFAULT_PROMPT_VISIBILITY

    normalized = str(value).strip().lower()
    if not normalized:
        return DEFAULT_PROMPT_VISIBILITY

    allowed_values = {visibility.value for visibility in PromptVisibility}
    if normalized not in allowed_values:
        raise ValueError(
            f"Invalid prompt_visibility. Must be one of: {', '.join(sorted(allowed_values))}"
        )

    return normalized


def normalize_visible_to_user_ids(value: Optional[List[str]]) -> Optional[List[str]]:
    """Normalize visible_to_user_ids: deduplicate, strip whitespace, remove empties.

    Returns None (unrestricted) when input is None or empty after normalization.
    """
    if not value:
        return None
    cleaned = list(dict.fromkeys(uid.strip() for uid in value if uid and uid.strip()))
    return cleaned if cleaned else None


def _normalize_user_identifier(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized.lower() if "@" in normalized else normalized


def _current_user_identifiers(current_user: Dict[str, Any]) -> Set[str]:
    identifiers: Set[str] = set()
    for key in (
        "id",
        "user_id",
        "email",
        "preferred_username",
        "upn",
        "microsoft_oid",
        "oid",
    ):
        normalized = _normalize_user_identifier(current_user.get(key))
        if normalized:
            identifiers.add(normalized)
    return identifiers


def can_user_use_prompt_visibility(current_user: Optional[Dict[str, Any]], visibility: Optional[str]) -> bool:
    """Return whether a user is allowed to use a prompt with this visibility."""

    normalized = normalize_prompt_visibility(visibility)

    if normalized == PromptVisibility.NOBODY.value:
        return False

    if normalized == PromptVisibility.ONLY_EDITORS.value:
        user_permission = (current_user or {}).get("permission")
        return has_permission_level(user_permission, PermissionLevel.EDITOR.value)

    return True


def can_user_access_subcategory(
    current_user: Optional[Dict[str, Any]],
    subcategory: Dict[str, Any],
    *,
    permission_service: Any = None,
    business_unit_id: Optional[str] = None,
) -> bool:
    """Composed runtime access check for a subcategory (meeting type).

    Checks in order:
    1. prompt_visibility=nobody (hard hidden)
    2. business_unit access (user must belong to the subcategory's BU)
    3. visible_to_user_ids allowlist (explicit user grant/restriction)
    4. prompt_visibility role-level access when no allowlist grants access

    A matching allowlist entry grants access through ONLY_EDITORS, but NOBODY
    remains a hard hide state. Empty/missing visible_to_user_ids means
    unrestricted by user and falls back to role visibility.
    """
    if not current_user:
        return False

    visibility = subcategory.get("prompt_visibility")
    normalized_visibility = normalize_prompt_visibility(visibility)

    # 1. Hard-hidden state always blocks.
    if normalized_visibility == PromptVisibility.NOBODY.value:
        return False

    # 2. Business unit access (skip if no permission_service or BU info)
    if permission_service and business_unit_id:
        if not permission_service.has_business_unit_access(current_user, business_unit_id):
            return False

    # 3. Explicit user allowlist. When set, only matching users get access.
    visible_to = subcategory.get("visible_to_user_ids")
    if visible_to:
        allowed_identifiers = {
            normalized
            for normalized in (_normalize_user_identifier(value) for value in visible_to)
            if normalized
        }
        return bool(_current_user_identifiers(current_user).intersection(allowed_identifiers))

    # 4. Role-level visibility when no explicit allowlist is set.
    return can_user_use_prompt_visibility(current_user, normalized_visibility)
