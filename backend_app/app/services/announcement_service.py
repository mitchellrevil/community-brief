"""
Announcement service for managing system announcements.

Provides CRUD operations for announcements and filtering of active
announcements based on user role and time constraints.
"""

from datetime import UTC, datetime
from typing import Dict, Any, Optional, List
from uuid import uuid4

from ..core.logging import get_logger
from ..repositories.announcements import AnnouncementRepository
from .interfaces import AnnouncementServiceInterface
from ..utils.cache_utils import TTLCache

logger = get_logger(__name__)

_active_announcements_cache = TTLCache[List[Dict[str, Any]]](default_ttl=600.0)
_announcement_by_id_cache = TTLCache[Dict[str, Any]](default_ttl=600.0)


class AnnouncementService(AnnouncementServiceInterface):
    """
    Service for managing announcements stored in Cosmos DB.
    
    Documents include "type": "announcement" for filtered queries.
    Timestamps are stored as epoch milliseconds.
    """

    def __init__(self, announcement_repository: AnnouncementRepository):
        """
        Initialize the announcement service.
        
        Args:
            announcement_repository: Repository for announcement persistence.
        """
        self._announcement_repository = announcement_repository
    
    @staticmethod
    def _epoch_ms() -> int:
        """Return current epoch time in milliseconds."""
        return int(datetime.now(UTC).timestamp() * 1000)
    
    async def create_announcement(
        self,
        announcement: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a new announcement.
        
        Generates an ID if not provided, sets type to "announcement",
        and sets created_at and updated_at timestamps.
        
        Args:
            announcement: Announcement data to create.
            
        Returns:
            The created announcement document.
        """
        # Generate ID if not provided
        doc_id = announcement.get("id")
        if not doc_id:
            doc_id = f"announcement_{uuid4()}"
        
        now_ms = self._epoch_ms()
        
        # Build document with required fields
        document = {
            **announcement,
            "id": doc_id,
            "type": "announcement",
            "created_at": now_ms,
            "updated_at": now_ms,
        }
        
        result = await self._announcement_repository.create(document)
        await self._invalidate_cached_responses()
        logger.info("announcement.created", announcement_id=doc_id)
        return result
    
    async def get_announcement(
        self,
        announcement_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get an announcement by ID.
        
        Args:
            announcement_id: The announcement ID.
            
        Returns:
            The announcement document, or None if not found.
        """
        cache_key = f"announcement:{announcement_id}"
        cached = await _announcement_by_id_cache.get(cache_key)
        if cached is not None:
            return cached

        announcement = await self._announcement_repository.get_by_id(announcement_id)
        if announcement is not None:
            await _announcement_by_id_cache.set(cache_key, announcement)
        return announcement
    
    async def update_announcement(
        self,
        announcement_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update an existing announcement.
        
        Merges updates with the existing document and updates the updated_at timestamp.
        
        Args:
            announcement_id: The announcement ID to update.
            updates: Dictionary of fields to update.
            
        Returns:
            The updated announcement document, or None if not found.
        """
        update_doc = {
            **updates,
            "updated_at": self._epoch_ms(),
        }
        
        result = await self._announcement_repository.update(announcement_id, update_doc)
        if result is None:
            return None
        await self._invalidate_cached_responses()
        logger.info("announcement.updated", announcement_id=announcement_id)
        return result
    
    async def delete_announcement(
        self,
        announcement_id: str
    ) -> bool:
        """
        Delete an announcement.
        
        Args:
            announcement_id: The announcement ID to delete.
            
        Returns:
            True if deleted successfully, False if not found.
        """
        deleted = await self._announcement_repository.delete(announcement_id)
        if deleted:
            await self._invalidate_cached_responses()
            logger.info("announcement.deleted", announcement_id=announcement_id)
        return deleted
    
    async def list_announcements(
        self,
        limit: int = 50,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        List announcements with pagination.
        
        Args:
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            filters: Optional filters to apply (e.g., {"is_active": True}).
            
        Returns:
            Dictionary with items, total, limit, and offset.
        """
        return await self._announcement_repository.list(
            limit=limit,
            offset=offset,
            filters=filters,
        )
    
    async def get_active_announcements_for_user(
        self,
        user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Get active announcements visible to the given user.
        
        Filters announcements where:
        - is_active is true
        - start_at <= now OR start_at is undefined
        - end_at > now OR end_at is undefined
        - target_roles is empty OR contains user's permission
        
        Args:
            user: User dictionary with "permission" field.
            
        Returns:
            List of active announcements for the user.
        """
        cache_key = self._active_cache_key(user)
        cached = await _active_announcements_cache.get(cache_key)
        if cached is not None:
            return cached

        now_ms = self._epoch_ms()
        user_role = user.get("permission", "USER")
        user_id = user.get("id")
        user_email = user.get("email")
        user_service_areas = [
            area
            for area in (
                user.get("business_unit_ids") or []
            )
            if isinstance(area, str) and area
        ]
        user_service_areas.extend(
            area
            for area in (user.get("business_unit_names") or [])
            if isinstance(area, str) and area
        )
        if user.get("business_unit_id"):
            user_service_areas.append(user["business_unit_id"])

        announcements = await self._announcement_repository.get_active_for_user(
            now_ms=now_ms,
            user_role=user_role,
            user_id=user_id,
            user_email=user_email,
            user_service_areas=user_service_areas,
        )
        await _active_announcements_cache.set(cache_key, announcements)
        return announcements

    async def mark_announcement_read(
        self,
        announcement_id: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        logger.info(
            "announcement.read_acknowledged",
            announcement_id=announcement_id,
            user_id=user_id,
        )
        return {
            "status": "success",
            "message": "Announcement marked as read",
            "announcement_id": announcement_id,
        }

    async def dismiss_announcement(
        self,
        announcement_id: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        logger.info(
            "announcement.dismiss_acknowledged",
            announcement_id=announcement_id,
            user_id=user_id,
        )
        return {
            "status": "success",
            "message": "Announcement dismissed",
            "announcement_id": announcement_id,
        }

    @classmethod
    async def _invalidate_cached_responses(cls) -> None:
        await _active_announcements_cache.clear()
        await _announcement_by_id_cache.clear()

    @staticmethod
    def _active_cache_key(user: Dict[str, Any]) -> str:
        business_unit_ids = ",".join(
            sorted(
                str(value)
                for value in (user.get("business_unit_ids") or [])
                if isinstance(value, str) and value
            )
        )
        business_unit_names = ",".join(
            sorted(
                str(value)
                for value in (user.get("business_unit_names") or [])
                if isinstance(value, str) and value
            )
        )
        return (
            f"{user.get('id')}:{user.get('permission')}:{user.get('business_unit_id')}:"
            f"{business_unit_ids}:{business_unit_names}"
        )
