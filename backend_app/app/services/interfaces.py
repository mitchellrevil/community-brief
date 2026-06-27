from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime


class AnnouncementServiceInterface(ABC):
    """
    Interface for announcement management services.
    
    Defines the contract for CRUD operations on announcements
    and filtering active announcements for users.
    """
    
    @abstractmethod
    async def create_announcement(
        self,
        announcement: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new announcement and return the created document."""
        pass
    
    @abstractmethod
    async def get_announcement(
        self,
        announcement_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get an announcement by ID. Returns None if not found."""
        pass
    
    @abstractmethod
    async def update_announcement(
        self,
        announcement_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an announcement. Returns None if not found."""
        pass
    
    @abstractmethod
    async def delete_announcement(
        self,
        announcement_id: str
    ) -> bool:
        """Delete an announcement. Returns True if deleted, False if not found."""
        pass
    
    @abstractmethod
    async def list_announcements(
        self,
        limit: int = 50,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """List announcements with pagination. Returns items, total, limit, offset."""
        pass
    
    @abstractmethod
    async def get_active_announcements_for_user(
        self,
        user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Get active announcements visible to the given user based on role and time."""
        pass

    @abstractmethod
    async def mark_announcement_read(
        self,
        announcement_id: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record or acknowledge that a user has read an announcement."""
        pass

    @abstractmethod
    async def dismiss_announcement(
        self,
        announcement_id: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record or acknowledge that a user has dismissed an announcement."""
        pass


class AnalyticsServiceInterface(ABC):
    @abstractmethod
    async def record_event(
        self,
        event_type: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        pass
    
    @abstractmethod
    async def get_user_analytics(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    async def get_system_metrics(
        self,
        metric_types: Optional[List[str]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        pass


class StorageServiceInterface(ABC):
    @abstractmethod
    async def upload_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: str = "application/octet-stream",
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        pass
    
    @abstractmethod
    async def download_file(self, file_id: str) -> Optional[bytes]:
        pass
    
    @abstractmethod
    async def delete_file(self, file_id: str) -> bool:
        pass
    
    @abstractmethod
    async def get_file_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        pass
    
    @abstractmethod
    async def list_user_files(
        self,
        user_id: str,
        limit: Optional[int] = None,
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        pass


class SystemHealthServiceInterface(ABC):
    """
    Interface for system health and monitoring services.
    
    Defines the contract for checking system health status.
    """
    
    @abstractmethod
    async def get_system_health(self) -> Dict[str, Any]:
        """Get overall system health status."""
        pass
    
    @abstractmethod
    async def get_detailed_health(self) -> Dict[str, Any]:
        """Get detailed health information."""
        pass
    
    @abstractmethod
    async def get_quick_health(self) -> Dict[str, Any]:
        """Get quick health check."""
        pass


class ExportServiceInterface(ABC):
    """
    Interface for data export services.
    
    Defines the contract for exporting analytics and user data.
    """
    
    @abstractmethod
    async def export_user_data(
        self,
        user_id: str,
        export_format: str = "json",
        include_analytics: bool = True
    ) -> Dict[str, Any]:
        """Export all data for a user."""
        pass
    
    @abstractmethod
    async def export_analytics_data(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        export_format: str = "json"
    ) -> Dict[str, Any]:
        """Export analytics data for a date range."""
        pass

    @abstractmethod
    async def export_user_details_pdf(
        self,
        user_id: str,
        include_analytics: bool = True,
        days: int = 30,
        business_unit_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Export a PDF with user details (and optional analytics)."""
        pass

    @abstractmethod
    async def export_system_analytics_csv(
        self,
        days: int = 30,
        business_unit_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Export system analytics as CSV for a given range of days."""
        pass

    @abstractmethod
    async def export_users_csv(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Export users to CSV and return metadata including record_count."""
        pass

    @abstractmethod
    async def stream_users_csv(
        self,
        filters: Optional[Dict[str, Any]] = None,
        business_unit_ids: Optional[List[str]] = None,
    ):
        """Stream users as CSV lines for the given filters."""
        pass


class PromptServiceInterface(ABC):
    """
    Interface for prompt management services.
    
    Defines the contract for managing AI prompts and templates.
    """
    
    @abstractmethod
    async def get_prompt(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get a prompt by ID."""
        pass
    
    @abstractmethod
    async def create_prompt(
        self,
        prompt_data: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> str:
        """Create a new prompt and return its ID."""
        pass
    
    @abstractmethod
    async def update_prompt(
        self,
        prompt_id: str,
        updates: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> bool:
        """Update an existing prompt."""
        pass
    
    @abstractmethod
    async def delete_prompt(
        self,
        prompt_id: str,
        user_id: Optional[str] = None
    ) -> bool:
        """Delete a prompt."""
        pass
    
    @abstractmethod
    async def list_prompts(
        self,
        user_id: Optional[str] = None,
        category: Optional[str] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """List available prompts."""
        pass


class TalkingPointsServiceInterface(ABC):
    """
    Interface for talking points validation and processing services.
    
    Defines the contract for managing talking points structure validation,
    format conversion, and response normalization.
    """
    
    @abstractmethod
    def validate_talking_points_structure(
        self, 
        talking_points: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Validate and convert talking points to database format.
        
        Args:
            talking_points: List of talking point sections from frontend
            
        Returns:
            List of validated talking point sections
        """
        pass
    
    @abstractmethod
    def convert_talking_points_to_response(
        self, 
        talking_points_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Convert database talking points to response format.
        
        Args:
            talking_points_data: Talking points from database
            
        Returns:
            Formatted talking points for frontend
        """
        pass
    
    @abstractmethod
    def normalize_talking_points_sections(
        self, 
        talking_points: List[Any]
    ) -> List[Dict[str, Any]]:
        """
        Normalize talking points into structured sections.
        
        Args:
            talking_points: List of strings or structured section dictionaries
            
        Returns:
            List of structured talking point sections
        """
        pass
    
    @abstractmethod
    def ensure_talking_points_structure(
        self, 
        subcategory_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Ensure talking points are in the correct response format.
        
        Args:
            subcategory_data: Subcategory data from database
            
        Returns:
            Subcategory data with properly formatted talking points
        """
        pass
