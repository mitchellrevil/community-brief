from typing import List, Optional

from pydantic import BaseModel, Field


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=5000)
    announcement_type: str = Field(default="info", description="Type: info, warning, critical")
    priority: int = Field(default=0, ge=0, le=10)
    is_active: bool = Field(default=True)
    target_roles: List[str] = Field(default_factory=list)
    target_service_areas: List[str] = Field(default_factory=list)
    start_at: Optional[int] = Field(default=None, description="Epoch ms when announcement becomes visible")
    end_at: Optional[int] = Field(default=None, description="Epoch ms when announcement expires")


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    message: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    announcement_type: Optional[str] = Field(default=None)
    priority: Optional[int] = Field(default=None, ge=0, le=10)
    is_active: Optional[bool] = Field(default=None)
    target_roles: Optional[List[str]] = Field(default=None)
    target_service_areas: Optional[List[str]] = Field(default=None)
    start_at: Optional[int] = Field(default=None)
    end_at: Optional[int] = Field(default=None)


class AnnouncementResponse(BaseModel):
    id: str
    title: str
    message: str
    announcement_type: str = "info"
    priority: int = 0
    is_active: bool = True
    target_roles: List[str] = Field(default_factory=list)
    target_service_areas: List[str] = Field(default_factory=list)
    start_at: Optional[int] = None
    end_at: Optional[int] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None

    class Config:
        extra = "allow"
