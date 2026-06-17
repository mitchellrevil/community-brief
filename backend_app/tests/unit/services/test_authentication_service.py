"""Authentication workflow tests."""
from __future__ import annotations

from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from passlib.exc import MissingBackendError

from app.core.errors.domain import AuthenticationError
from app.core.security import get_password_hash, verify_password
from app.schemas.auth import LoginRequest
from app.services.auth.authentication_service import (
    AuthenticationService,
    create_access_token,
)


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_config():
    config = MagicMock()
    config.jwt_secret_key = "test_secret"
    config.jwt_algorithm = "HS256"
    config.jwt_access_token_expire_minutes = 30
    config.jwt_refresh_token_expire_days = 7
    config.microsoft_tenant_id = "test_tenant"
    config.microsoft_client_id = "test_client"
    config.microsoft_jwks_timeout_seconds = 2.5
    config.password_login_enabled = True
    return config


@pytest.fixture
def mock_user_repository():
    repository = AsyncMock()
    repository.get_by_email = AsyncMock()
    repository.get_by_id = AsyncMock()
    repository.create = AsyncMock()
    repository.update = AsyncMock()
    return repository


@pytest.fixture
def mock_analytics_service():
    service = AsyncMock()
    service.track_event = AsyncMock()
    return service


def create_user(
    user_id: str = "user_123",
    email: str = "user@example.com",
    permission: str = "User",
) -> Dict[str, Any]:
    return {
        "id": user_id,
        "email": email,
        "permission": permission,
        "hashed_password": get_password_hash("correct_password"),
    }


def auth_service(
    mock_user_repository,
    mock_config,
    mock_analytics_service=None,
) -> AuthenticationService:
    return AuthenticationService(
        user_repository=mock_user_repository,
        config=mock_config,
        analytics_service=mock_analytics_service,
    )


class TestPasswordSecurity:
    def test_verify_password_returns_true_for_correct_password(self):
        password = "test_password_123"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_returns_false_for_incorrect_password(self):
        hashed = get_password_hash("correct_password")

        assert verify_password("wrong_password", hashed) is False

    def test_get_password_hash_returns_verifiable_hash(self):
        hashed = get_password_hash("test_password")

        assert hashed != "test_password"
        assert verify_password("test_password", hashed) is True

    def test_get_password_hash_returns_different_hash_each_time(self):
        assert get_password_hash("test_password") != get_password_hash("test_password")

    def test_get_password_hash_uses_pbkdf2_fallback_when_primary_backend_fails(self):
        fallback_context = MagicMock()
        fallback_context.hash.return_value = "fallback-hash"

        with (
            patch("app.core.security.pwd_context.hash", side_effect=MissingBackendError("argon2 unavailable")),
            patch("app.core.security.CryptContext", return_value=fallback_context) as context_class,
        ):
            result = get_password_hash("test_password")

        assert result == "fallback-hash"
        context_class.assert_called_once_with(schemes=["pbkdf2_sha256"], deprecated="auto")
        fallback_context.hash.assert_called_once_with("test_password")

    def test_get_password_hash_raises_when_pbkdf2_fallback_fails(self):
        fallback_context = MagicMock()
        fallback_context.hash.side_effect = MissingBackendError("pbkdf2 unavailable")

        with (
            patch("app.core.security.pwd_context.hash", side_effect=MissingBackendError("argon2 unavailable")),
            patch("app.core.security.CryptContext", return_value=fallback_context),
            pytest.raises(MissingBackendError, match="pbkdf2 unavailable"),
        ):
            get_password_hash("test_password")

    def test_get_password_hash_does_not_fallback_for_invalid_password_value(self):
        with (
            patch("app.core.security.pwd_context.hash", side_effect=ValueError("invalid password")),
            patch("app.core.security.CryptContext") as context_class,
            pytest.raises(ValueError, match="invalid password"),
        ):
            get_password_hash("test_password")

        context_class.assert_not_called()


class TestTokenCreation:
    def test_create_access_token_creates_valid_jwt(self, mock_config):
        token = create_access_token({"sub": "user@example.com"}, mock_config)

        assert isinstance(token, str)
        assert len(token.split(".")) == 3


class TestAuthenticateUser:
    @pytest.mark.asyncio
    async def test_returns_user_on_valid_credentials(self, mock_user_repository, mock_config):
        user = create_user()
        mock_user_repository.get_by_email.return_value = user

        result = await auth_service(mock_user_repository, mock_config).authenticate_user(
            "user@example.com",
            "correct_password",
        )

        assert result is not False
        assert result["email"] == "user@example.com"

    @pytest.mark.asyncio
    async def test_returns_false_on_invalid_password(self, mock_user_repository, mock_config):
        mock_user_repository.get_by_email.return_value = create_user()

        result = await auth_service(mock_user_repository, mock_config).authenticate_user(
            "user@example.com",
            "wrong_password",
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_user_not_found(self, mock_user_repository, mock_config):
        mock_user_repository.get_by_email.return_value = None

        result = await auth_service(mock_user_repository, mock_config).authenticate_user(
            "missing@example.com",
            "any_password",
        )

        assert result is False


class TestPasswordLogin:
    @pytest.mark.asyncio
    async def test_returns_token_on_successful_login(self, mock_user_repository, mock_config):
        mock_user_repository.get_by_email.return_value = create_user(permission="User")

        result = await auth_service(mock_user_repository, mock_config).login(
            LoginRequest(email="user@example.com", password="correct_password")
        )

        assert result.body["status"] == 200
        assert "access_token" in result.body
        assert result.body["token_type"] == "bearer"
        mock_user_repository.update.assert_called_once()
        update_payload = mock_user_repository.update.call_args.args[1]
        assert update_payload["is_active"] is True

    @pytest.mark.asyncio
    async def test_raises_auth_error_on_wrong_password(self, mock_user_repository, mock_config):
        mock_user_repository.get_by_email.return_value = create_user(permission="Admin")

        with pytest.raises(AuthenticationError):
            await auth_service(mock_user_repository, mock_config).login(
                LoginRequest(email="user@example.com", password="wrong_password")
            )

    @pytest.mark.asyncio
    async def test_raises_auth_error_when_password_login_disabled(self, mock_user_repository, mock_config):
        mock_config.password_login_enabled = False
        mock_user_repository.get_by_email.return_value = create_user(permission="Admin")

        with pytest.raises(AuthenticationError, match="Password login is disabled"):
            await auth_service(mock_user_repository, mock_config).login(
                LoginRequest(email="user@example.com", password="correct_password")
            )

    @pytest.mark.asyncio
    async def test_allows_password_login_for_standard_users(self, mock_user_repository, mock_config):
        mock_user_repository.get_by_email.return_value = create_user(permission="User")

        result = await auth_service(mock_user_repository, mock_config).login(
            LoginRequest(email="user@example.com", password="correct_password")
        )

        assert result.body["status"] == 200
        assert result.body["permission"] == "User"
        assert "access_token" in result.body
