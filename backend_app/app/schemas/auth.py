"""Authentication API contracts."""

from pydantic import BaseModel, field_validator

from ..utils.input_validation import InputValidator


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("Email is required")
        if len(value) > 254:
            raise ValueError("Email too long")
        if not InputValidator.validate_email(value):
            raise ValueError("Invalid email format")
        return value.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password_format(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("Password is required")
        if len(value) < 1 or len(value) > 1024:
            raise ValueError("Invalid password length")
        if InputValidator.contains_dangerous_patterns(value):
            raise ValueError("Invalid characters in password")
        return value
