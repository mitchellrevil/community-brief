"""PermissionService providing permission hierarchy and business unit guards.

This service uses the canonical helpers in `app.models.permissions` and
provides resource-level permission helpers used by routers and services.
"""
from typing import Optional, Dict, Any, List

from azure.cosmos.exceptions import CosmosHttpResponseError

from ...core.logging import get_logger
from ...models.permissions import (
    PermissionLevel,
    has_permission_level,
    normalize_permission,
    get_permission_level,
    PERMISSION_HIERARCHY,
)
from ...repositories.users import UserRepository
from ...utils.permission_cache import BasePermissionCache

logger = get_logger(__name__)

PERMISSION_LOOKUP_ERRORS = (CosmosHttpResponseError, RuntimeError, TypeError, ValueError)




class PermissionService:
    def __init__(
        self,
        permission_cache: BasePermissionCache,
        user_repository: UserRepository | None = None,
    ):
        self.user_repository = user_repository
        self._permission_cache: BasePermissionCache = permission_cache
        self._prompt_service = None

    def set_user_repository(self, user_repository: UserRepository):
        self.user_repository = user_repository
        return self

    def set_permission_cache(self, permission_cache: BasePermissionCache):
        self._permission_cache = permission_cache
        return self

    def set_prompt_service(self, prompt_service):
        """Set the prompt service for business unit resolution.
        
        This allows async resolution of business unit IDs by traversing
        the category hierarchy to find the root (top-level) category.
        """
        self._prompt_service = prompt_service
        return self

    async def get_user_permission(self, user_id: str) -> Optional[str]:
        try:
            if not self.user_repository:
                logger.warning("user_repository_missing_for_permission_lookup", user_id=user_id)
                return None
            if not user_id:
                return None

            cached_permission = await self._permission_cache.get_user_permission(user_id)
            if cached_permission is not None:
                return cached_permission

            user = await self.user_repository.get_by_id(user_id)
            permission = user.get("permission") if user else None
            if permission:
                await self._permission_cache.set_user_permission(user_id, permission)
            return permission
        except PERMISSION_LOOKUP_ERRORS as e:
            logger.warning("get_user_permission_failed", user_id=user_id, error=str(e))
            return None

    async def get_users_by_permission(
        self,
        permission: str,
        *,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if not self.user_repository:
            logger.warning("user_repository_missing_for_users_by_permission", permission=permission)
            return []

        try:
            users = await self.user_repository.get_by_permission(permission, limit=limit)
            return users
        except PERMISSION_LOOKUP_ERRORS as exc:
            logger.warning("get_users_by_permission_failed", permission=permission, error=str(exc))
            return []

    def has_permission_level_method(self, user_permission: str, required_permission: PermissionLevel) -> bool:
        if not user_permission:
            return False
        return has_permission_level(user_permission, required_permission.value)


    # ============================================================================
    # BUSINESS UNIT PERMISSION METHODS
    # ============================================================================

    async def _derive_business_unit_id(self, item: Dict[str, Any]) -> Optional[str]:
        """
        Derive the business_unit_id from an item's relationships.
        
        For categories and subcategories, business unit is determined by traversing
        the category hierarchy to find the root (top-level) category:
        - item.business_unit_id (if already set)
        - For categories: traverse parent_category_id chain to find root
        - For subcategories: traverse category_id -> parent chain to find root
        
        Args:
            item: Category or subcategory dict
        
        Returns:
            The business_unit_id or None if cannot be determined
        """
        if not item:
            return None

        logger.debug(
            "business_unit_derivation_started",
            item_id=item.get("id"),
            item_type=item.get("type"),
            business_unit_id=item.get("business_unit_id"),
            parent_category_id=item.get("parent_category_id"),
            category_id=item.get("category_id"),
        )

        # Categories can trust their stored business_unit_id because category moves
        # update that field. Subcategories cannot, because prompt moves historically
        # left stale values behind.
        if item.get("type") == "prompt_category" and item.get("business_unit_id"):
            bu = item.get("business_unit_id")
            logger.debug("business_unit_derived_category_direct", business_unit_id=bu, item_id=item.get("id"))
            return bu

        # If it's a top-level category (no parent), its ID is the business unit
        if item.get("type") == "prompt_category" and not item.get("parent_category_id"):
            bu = item.get("id")
            logger.debug("business_unit_derived_top_level_category", business_unit_id=bu, item_id=item.get("id"))
            return bu
        
        # For nested categories, we need to traverse to the root
        if item.get("type") == "prompt_category" and item.get("parent_category_id"):
            if self._prompt_service:
                # Use prompt service to traverse to root category
                bu = await self._prompt_service.get_business_unit_id_from_category(item.get("id"))
                logger.debug(
                    "business_unit_derived_category_traversal",
                    business_unit_id=bu,
                    category_id=item.get("id"),
                )
                return bu
            else:
                logger.warning(
                    "business_unit_derivation_prompt_service_missing",
                    category_id=item.get("id"),
                    parent_category_id=item.get("parent_category_id"),
                )
                bu = item.get("parent_category_id")
                logger.debug("business_unit_derived_parent_category", business_unit_id=bu, category_id=item.get("id"))
                return bu
        
        # For subcategories, traverse from category_id to root. Do not trust the
        # stored business_unit_id first because it can become stale after moves.
        if item.get("category_id"):
            if self._prompt_service:
                # Use prompt service to traverse to root category
                bu = await self._prompt_service.get_business_unit_id_from_category(item.get("category_id"))
                logger.debug(
                    "business_unit_derived_subcategory_traversal",
                    business_unit_id=bu,
                    subcategory_id=item.get("id"),
                )
                return bu
            else:
                logger.warning(
                    "subcategory_business_unit_derivation_prompt_service_missing",
                    subcategory_id=item.get("id"),
                    category_id=item.get("category_id"),
                )
                bu = item.get("category_id")
                logger.debug("business_unit_derived_category", business_unit_id=bu, subcategory_id=item.get("id"))
                return bu

        if item.get("business_unit_id"):
            bu = item.get("business_unit_id")
            logger.debug("business_unit_derived_direct", business_unit_id=bu, item_id=item.get("id"))
            return bu
        
        return None

    def has_business_unit_access(self, user: Dict[str, Any], business_unit_id: str) -> bool:
        """
        Check if a user has access to a specific business unit.
        
        Args:
            user: User dict with 'permission' and 'business_unit_ids' fields
            business_unit_id: The business unit ID to check access for
        
        Returns:
            True if user is Admin OR user has access to the business_unit_id, False otherwise
        """
        if not user:
            return False
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        # Admin and above have access to all business units
        if level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0):
            return True
        
        user_business_unit_ids = user.get("business_unit_ids") or []
        return isinstance(user_business_unit_ids, list) and business_unit_id in user_business_unit_ids

    async def can_edit_category(self, user: Dict[str, Any], category: Dict[str, Any]) -> bool:
        """
        Check if a user can edit a specific category.
        
        For nested categories, this traverses the parent hierarchy to find
        the root (top-level) category and checks against that business unit.
        
        Args:
            user: User dict with 'permission' and 'business_unit_ids' fields
            category: Category dict with business unit relationship fields
        
        Returns:
            True if user is Admin OR (Editor AND user's BU matches category's root BU), False otherwise
        """
        if not user or not category:
            return False

        logger.debug(
            "category_edit_permission_check_started",
            user_id=user.get("id"),
            role=user.get("permission"),
            business_unit_ids=user.get("business_unit_ids"),
            category_id=category.get("id"),
        )
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        # Admin and above can edit all categories
        if level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0):
            return True
        
        # Editors can only edit categories in their business unit
        editor_level = PERMISSION_HIERARCHY.get(PermissionLevel.EDITOR.value, 0)
        if level >= editor_level:
            category_business_unit_id = await self._derive_business_unit_id(category)
            if not category_business_unit_id:
                logger.warning("category_business_unit_derivation_failed", category_id=category.get("id"))
                return False

            logger.debug(
                "category_edit_permission_business_unit_resolved",
                business_unit_id=category_business_unit_id,
                category_id=category.get("id"),
                user_business_unit_ids=user.get("business_unit_ids"),
                role=user.get("permission"),
            )

            allowed = self.has_business_unit_access(user, category_business_unit_id)
            if not allowed:
                logger.warning(
                    "category_edit_permission_denied",
                    user_id=user.get("id"),
                    role=user.get("permission"),
                    user_business_unit_ids=user.get("business_unit_ids"),
                    required_business_unit_id=category_business_unit_id,
                    category_id=category.get("id"),
                )
            return allowed
        
        # Users and Public cannot edit categories
        return False

    async def can_edit_prompt(self, user: Dict[str, Any], prompt_or_subcategory: Dict[str, Any]) -> bool:
        """
        Check if a user can edit a specific prompt (within a subcategory).
        
        For prompts in nested categories, this traverses the category hierarchy
        to find the root (top-level) category and checks against that business unit.
        
        Args:
            user: User dict with 'permission' and 'business_unit_ids' fields
            prompt_or_subcategory: Prompt/subcategory dict with business unit relationship fields
        
        Returns:
            True if user is Admin OR (Editor AND user's BU matches prompt's root BU), False otherwise
        """
        if not user or not prompt_or_subcategory:
            return False

        logger.debug(
            "prompt_edit_permission_check_started",
            user_id=user.get("id"),
            role=user.get("permission"),
            business_unit_ids=user.get("business_unit_ids"),
            item_id=prompt_or_subcategory.get("id"),
        )
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        # Admin and above can edit all prompts
        if level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0):
            return True
        
        # Editors can only edit prompts in their business unit
        editor_level = PERMISSION_HIERARCHY.get(PermissionLevel.EDITOR.value, 0)
        if level >= editor_level:
            prompt_business_unit_id = await self._derive_business_unit_id(prompt_or_subcategory)
            if not prompt_business_unit_id:
                logger.warning("prompt_business_unit_derivation_failed", item_id=prompt_or_subcategory.get("id"))
                return False
            
            logger.debug(
                "prompt_edit_permission_business_unit_resolved",
                business_unit_id=prompt_business_unit_id,
                item_id=prompt_or_subcategory.get("id"),
                user_business_unit_ids=user.get("business_unit_ids"),
                role=user.get("permission"),
            )

            allowed = self.has_business_unit_access(user, prompt_business_unit_id)
            if not allowed:
                logger.warning(
                    "prompt_edit_permission_denied",
                    user_id=user.get("id"),
                    role=user.get("permission"),
                    user_business_unit_ids=user.get("business_unit_ids"),
                    required_business_unit_id=prompt_business_unit_id,
                    item_id=prompt_or_subcategory.get("id"),
                )
            return allowed
        
        # Users and Public cannot edit prompts
        return False

    def can_assign_user_to_business_unit(self, user: Dict[str, Any]) -> bool:
        """
        Check if a user can assign other users to business units.
        
        Args:
            user: User dict with 'permission' field
        
        Returns:
            True if user is Admin, False otherwise
        """
        if not user:
            return False
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        return level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0)

    def can_manage_business_units(self, user: Dict[str, Any]) -> bool:
        """
        Check if a user can create/edit/delete business units.
        
        Args:
            user: User dict with 'permission' field
        
        Returns:
            True if user is Admin, False otherwise
        """
        if not user:
            return False
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        return level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0)

    def can_view_all_business_units_analytics(self, user: Dict[str, Any]) -> bool:
        """
        Check if a user can view analytics across all business units.
        
        Args:
            user: User dict with 'permission' field
        
        Returns:
            True if user is Admin, False otherwise (editors can only see their own BU)
        """
        if not user:
            return False
        
        user_permission = user.get("permission", "")
        level = get_permission_level(user_permission)
        return level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0)

    def close(self):
        logger.info("permission_service_closed")
