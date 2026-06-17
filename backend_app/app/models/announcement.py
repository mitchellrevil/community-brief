"""Announcement domain model with type safety and validation."""
from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class AnnouncementPriority(str, Enum):
    """Priority levels for announcements."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"

    def __str__(self) -> str:
        return self.value


class ContentFormat(str, Enum):
    """Supported content formats for announcement body."""
    MARKDOWN = "markdown"
    PLAIN = "plain"

    def __str__(self) -> str:
        return self.value


class Announcement(BaseModel):
    """
    Typed announcement domain model.
    
    Represents system announcements that can be displayed to users based on
    targeting rules (roles, service areas) and scheduling (start_at, end_at).
    """
    
    id: str
    title: str = Field(..., max_length=255)
    body: str = Field(..., max_length=50000)
    content_format: ContentFormat = ContentFormat.MARKDOWN
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_active: bool = True
    target_roles: List[str] = Field(default_factory=list)
    target_service_areas: List[str] = Field(default_factory=list)
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL
    
    model_config = {
        "json_encoders": {
            datetime: lambda v: v.isoformat() if v else None
        }
    }
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """Validate and normalize title - must be non-empty after stripping."""
        stripped = v.strip() if v else ""
        if not stripped:
            raise ValueError("Title cannot be empty or whitespace only")
        return stripped
    
    @field_validator('priority', mode='before')
    @classmethod
    def coerce_priority(cls, v) -> AnnouncementPriority:
        """Coerce priority from string to enum."""
        if isinstance(v, AnnouncementPriority):
            return v
        if isinstance(v, str):
            return AnnouncementPriority(v)
        return AnnouncementPriority.NORMAL
    
    @field_validator('content_format', mode='before')
    @classmethod
    def coerce_content_format(cls, v) -> ContentFormat:
        """Coerce content_format from string to enum."""
        if isinstance(v, ContentFormat):
            return v
        if isinstance(v, str):
            return ContentFormat(v)
        return ContentFormat.MARKDOWN
    
    @model_validator(mode='after')
    def validate_date_range(self) -> 'Announcement':
        """Validate that start_at <= end_at when both are present."""
        if self.start_at is not None and self.end_at is not None:
            if self.start_at > self.end_at:
                raise ValueError("start_at must be less than or equal to end_at")
        return self
    
    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dictionary."""
        return self.model_dump(mode='json', exclude_none=False)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Announcement':
        """Create Announcement from dict (e.g., from Cosmos DB)."""
        return cls(**data)
