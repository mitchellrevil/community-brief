from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from ..utils.input_validation import InputValidator


class ShareJobRequest(BaseModel):
    shared_user_email: EmailStr
    permission_level: Literal["view", "edit", "admin"] = "view"
    message: Optional[str] = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value) > 1000:
            raise ValueError("Message cannot exceed 1000 characters")
        if InputValidator.contains_dangerous_patterns(value):
            raise ValueError("Invalid characters in message")
        return value.strip()


class JobShareResponse(BaseModel):
    status: str = Field(description="Operation status")
    message: str = Field(description="Human-readable message")
    sharing_id: Optional[str] = Field(default=None, description="ID of the created sharing record")
    permission_level: str = Field(description="Granted permission level")


class SharedJobInfo(BaseModel):
    user_id: str = Field(description="ID of the user")
    user_email: str = Field(description="Email of the user")
    permission_level: str = Field(description="Permission level granted")
    shared_at: int = Field(description="Unix timestamp when sharing was created")
    shared_by: str = Field(description="ID of user who created the share")
    shared_by_email: Optional[EmailStr] = Field(default=None, description="Email of user who created the share")
    message: Optional[str] = Field(default=None, description="Optional message included with the share")


class JobSharingInfoResponse(BaseModel):
    status: str = Field(description="Operation status")
    job_id: str = Field(description="ID of the job")
    is_owner: bool = Field(description="Whether the requesting user owns the job")
    user_permission: str = Field(description="Requesting user's permission level")
    shared_with: list[SharedJobInfo] = Field(default_factory=list, description="Users with whom the job is shared")
    total_shares: int = Field(description="Total number of active shares")
