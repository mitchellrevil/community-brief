"""User API schemas."""

from pydantic import BaseModel, field_validator

from ..models.permissions import PermissionLevel
from ..utils.input_validation import InputValidator


class RegisterUserRequest(BaseModel):
    email: str
    password: str
    permission: PermissionLevel | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("Email is required")
        if len(value) > 254:
            raise ValueError("Email too long")
        if not InputValidator.validate_email(value):
            raise ValueError("Invalid email format")
        return value.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("Password is required")
        if len(value) < 8 or len(value) > 1024:
            raise ValueError("Password must be between 8 and 1024 characters")
        if InputValidator.contains_dangerous_patterns(value):
            raise ValueError("Invalid characters in password")
        return value


class ChangePasswordRequest(BaseModel):
    new_password: str


class UserUpdateRequest(BaseModel):
    permission: PermissionLevel | None = None
    email: str | None = None
    is_active: bool | None = None


class AddUserToBusinessUnitRequest(BaseModel):
    user_email: str
    business_unit_ids: list[str] | None = None

    @field_validator("user_email")
    @classmethod
    def validate_user_email(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("User email is required")
        if len(value) > 254:
            raise ValueError("Email too long")
        if not InputValidator.validate_email(value):
            raise ValueError("Invalid email format")
        return value.lower().strip()

    @field_validator("business_unit_ids")
    @classmethod
    def validate_business_unit_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        if len(value) > 50:
            raise ValueError("Too many business units")
        for business_unit_id in value:
            if not isinstance(business_unit_id, str) or len(business_unit_id.strip()) == 0:
                raise ValueError("Invalid business unit ID format")
        return value


class SelfAssignToBusinessUnitRequest(BaseModel):
    business_unit_ids: list[str]

    @field_validator("business_unit_ids")
    @classmethod
    def validate_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("At least one business unit ID is required")
        if len(value) > 50:
            raise ValueError("Too many business units (max 50)")
        for business_unit_id in value:
            if not isinstance(business_unit_id, str) or len(business_unit_id.strip()) == 0:
                raise ValueError("Invalid business unit ID format")
        return value
