"""Job domain model with type safety and validation."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator

from app.models.job_status import (
    VALID_STATUSES,
    TERMINAL_STATUSES,
    IN_PROGRESS_STATUSES,
)


class Job(BaseModel):
    """
    Typed job domain model.
    
    Replaces dict-based job objects for improved type safety and business logic encapsulation.
    """
    
    id: str
    user_id: str
    displayname: str
    file_name: str
    file_path: str
    status: str = "uploaded"
    
    # Optional fields
    transcription_file_path: Optional[str] = None
    analysis_file_path: Optional[str] = None
    text_content: Optional[str] = None
    
    # Audio metadata
    audio_duration_seconds: Optional[float] = None
    audio_duration_minutes: Optional[float] = None
    
    # Prompt configuration
    prompt_category_id: Optional[str] = None
    prompt_subcategory_id: Optional[str] = None
    
    # Pre-session form data (JSON object)
    pre_session_form_data: Optional[dict] = None
    
    # Sharing
    shared_with: List[str] = Field(default_factory=list)
    
    # Soft delete
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    
    model_config = {
        "json_encoders": {
            datetime: lambda v: v.isoformat() if v else None
        }
    }
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        """
        Validate job status is a canonical value.
        
        Raises ValueError for unknown statuses to prevent SSE streaming issues.
        See app.models.job_status for canonical values.
        """
        if v not in VALID_STATUSES:
            raise ValueError(
                f"Invalid job status: '{v}'. "
                f"Must be one of: {', '.join(sorted(VALID_STATUSES))}"
            )
        return v
    
    def is_terminal(self) -> bool:
        """Check if job is in a terminal state (completed or failed)."""
        return self.status in TERMINAL_STATUSES
    
    def is_processing(self) -> bool:
        """Check if job is currently being processed."""
        return self.status in IN_PROGRESS_STATUSES
    
    def is_owned_by(self, user_id: str) -> bool:
        """Check if job is owned by the given user."""
        return self.user_id == user_id
    
    def is_shared_with(self, user_id: str) -> bool:
        """Check if job is shared with the given user."""
        return user_id in self.shared_with
    
    def can_be_accessed_by(self, user_id: str, is_admin: bool = False) -> bool:
        """Check if user can access this job (owner, shared, or admin)."""
        if is_admin:
            return True
        return self.is_owned_by(user_id) or self.is_shared_with(user_id)
    
    def can_be_edited_by(self, user_id: str, is_admin: bool = False) -> bool:
        """Check if user can edit this job (owner or admin only)."""
        if is_admin:
            return True
        return self.is_owned_by(user_id)
    
    def mark_deleted(self) -> None:
        """Mark job as soft-deleted."""
        self.is_deleted = True
        self.deleted_at = datetime.now(UTC)
        self.updated_at = datetime.now(UTC)
    
    def restore(self) -> None:
        """Restore a soft-deleted job."""
        self.is_deleted = False
        self.deleted_at = None
        self.updated_at = datetime.now(UTC)
    
    def update_status(self, new_status: str, **kwargs) -> None:
        """Update job status and related fields."""
        self.status = new_status
        self.updated_at = datetime.now(UTC)
        
        # Update optional fields if provided
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dictionary."""
        return self.model_dump(mode='json', exclude_none=False)
    
    @classmethod
    def from_dict(cls, data: dict) -> Job:
        """Create Job from dict (e.g., from Cosmos DB)."""
        return cls(**data)
    
    def to_api_response(self, include_urls: bool = False) -> dict:
        """
        Convert to API response format.
        
        Args:
            include_urls: If True, include SAS-enabled URLs (must be enriched separately)
        """
        response = self.to_dict()
        
        # Add computed fields
        response["is_terminal"] = self.is_terminal()
        response["is_processing"] = self.is_processing()
        response["shared_with_count"] = len(self.shared_with)
        
        # Remove sensitive internal fields
        response.pop("hashed_password", None)
        
        return response
