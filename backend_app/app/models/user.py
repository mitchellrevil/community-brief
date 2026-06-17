"""User domain model with type safety and encapsulation."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from .permissions import PermissionLevel


class User(BaseModel):
    """
    Typed user domain model.
    
    Replaces dict-based user objects for improved type safety and encapsulation.
    """
    
    id: str
    email: str
    full_name: Optional[str] = None
    hashed_password: Optional[str] = None
    permission: PermissionLevel = PermissionLevel.USER
    is_active: bool = True
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    
    # SSO fields
    microsoft_oid: Optional[str] = None
    microsoft_tid: Optional[str] = None
    
    model_config = {
        "json_encoders": {
            datetime: lambda v: v.isoformat() if v else None
        }
    }
    
    @field_validator('email')
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalize email to lowercase."""
        return v.lower().strip() if v else v
    
    @field_validator('permission', mode='before')
    @classmethod
    def coerce_permission(cls, v) -> PermissionLevel:
        """Coerce permission from string or int to enum."""
        if isinstance(v, PermissionLevel):
            return v
        if isinstance(v, str):
            return PermissionLevel(v)
        if isinstance(v, int):
            for level in PermissionLevel:
                if level.value == v:
                    return level
        return PermissionLevel.USER
    
    def has_permission(self, required: PermissionLevel) -> bool:
        """Check if user has at least the required permission level."""
        return self.permission.value >= required.value
    
    def is_admin(self) -> bool:
        """Check if user is an admin."""
        return self.permission == PermissionLevel.ADMIN
    
    def is_editor_or_above(self) -> bool:
        """Check if user is editor or admin."""
        return self.permission.value >= PermissionLevel.EDITOR.value
    
    def to_dict(self) -> dict:
        """Serialize to a JSON-compatible dictionary."""
        return self.model_dump(mode='json', exclude_none=False)
    
    @classmethod
    def from_dict(cls, data: dict) -> User:
        """Create User from dict (e.g., from Cosmos DB)."""
        return cls(**data)
    
    def to_public_dict(self) -> dict:
        """Return safe public representation without sensitive fields."""
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "permission": self.permission.value,
            "is_active": self.is_active,
        }
