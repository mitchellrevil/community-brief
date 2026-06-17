"""Authentication workflows for Entra-backed sessions and password login."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Dict

from jose import jwt

from ...core.config import AppConfig
from ...core.errors.domain import (
    AuthenticationError,
)
from ...core.logging import get_logger
from ...core.security import verify_password
from ...repositories.users import UserRepository
from ...schemas.auth import LoginRequest


logger = get_logger(__name__)

@dataclass(frozen=True)
class AuthResponse:
    body: Dict[str, Any]


def create_access_token(data: dict, config: Any) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(
        minutes=config.jwt_access_token_expire_minutes
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, config.jwt_secret_key, algorithm=config.jwt_algorithm)


class AuthenticationService:
    def __init__(
        self,
        *,
        user_repository: UserRepository,
        config: AppConfig,
        analytics_service: Any | None = None,
    ) -> None:
        self.user_repository = user_repository
        self.config = config
        self.analytics_service = analytics_service

    async def authenticate_user(self, email: str, password: str) -> Dict[str, Any] | bool:
        user = await self.user_repository.get_by_email(email)
        if not user:
            return False
        if not verify_password(password, user["hashed_password"]):
            return False
        return user

    async def login(self, login_request: LoginRequest) -> AuthResponse:
        if not self.config.password_login_enabled:
            raise AuthenticationError("Password login is disabled")

        email = login_request.email
        user = await self.authenticate_user(email, login_request.password)

        if not user:
            logger.warning("auth_login_failed", email=email)
            raise AuthenticationError(
                "Incorrect email or password",
                details={"email": email},
            )

        permission = user.get("permission") or "User"

        access_token = create_access_token(
            data={
                "sub": user["id"],
                "email": user["email"],
                "auth_source": "password",
            },
            config=self.config,
        )
        now_iso = self._now_iso()
        await self.user_repository.update(
            user["id"],
            {
                "last_login": now_iso,
                "is_active": True,
            },
        )

        logger.info("auth_login_succeeded", email=email)
        return AuthResponse(
            body=self._login_body(user=user, access_token=access_token, permission=permission),
        )

    def _login_body(
        self,
        *,
        user: Dict[str, Any],
        access_token: str,
        permission: str,
    ) -> Dict[str, Any]:
        return {
            "status": 200,
            "message": "Login successful",
            "access_token": access_token,
            "token_type": "bearer",
            "permission": permission,
            "user": {
                "id": user.get("id"),
                "email": user.get("email"),
                "full_name": user.get("full_name"),
                "permission": permission,
            },
        }

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat()
