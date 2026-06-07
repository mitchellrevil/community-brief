"""
Unit tests for auth.py

Tests for authentication dependencies including:
- get_current_user - JWT-based user authentication
- get_current_user_sse - SSE endpoint authentication using header/cookie tokens only
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from azure.cosmos.exceptions import CosmosHttpResponseError

from app.core.auth import get_current_user, get_current_user_sse


# Mark all tests as unit tests
pytestmark = pytest.mark.unit

VALID_HS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.e30."
VALID_RS_TOKEN = "eyJhbGciOiJSUzI1NiJ9.e30."


# =====================================================================# FIXTURES
# =====================================================================
@pytest.fixture
def mock_request():
    """Create a mock Request object."""
    request = MagicMock(spec=Request)
    request.state = MagicMock()
    request.state.current_user = None
    request.headers = {}
    request.cookies = {}
    request.app = MagicMock()
    request.app.state.config = MagicMock(
        jwt_algorithm="HS256",
        jwt_secret_key="test_secret",
    )
    return request


@pytest.fixture
def mock_config():
    """Create a mock AppConfig."""
    return MagicMock(
        jwt_algorithm="HS256",
        jwt_secret_key="test_secret",
    )


@pytest.fixture
def mock_credentials():
    """Create mock HTTP bearer credentials."""
    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=VALID_HS_TOKEN,
    )


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    service = AsyncMock()
    service.get_by_id = AsyncMock()
    service.get_by_email = AsyncMock()
    service.get_by_entra_identity = AsyncMock()
    service.create = AsyncMock()
    service.update = AsyncMock()
    return service


def create_user(
    user_id: str = "user_123",
    email: str = "user@example.com",
    permission: str = "Viewer",
):
    """Helper to create test user dicts."""
    return {
        "id": user_id,
        "email": email,
        "permission": permission,
    }


def create_jwt_payload(
    sub: str = "user_123",
    email: str = "user@example.com",
):
    """Helper to create mock JWT payload."""
    return {
        "sub": sub,
        "email": email,
        "exp": 9999999999,
    }


# =====================================================================# TEST: get_current_user - Token Decoding
# =====================================================================
class TestGetCurrentUserTokenDecoding:
    """Tests for token decoding in get_current_user."""
    
    @pytest.mark.asyncio
    async def test_raises_401_on_invalid_token(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given invalid token, when authenticating, then raises 401."""
        from app.utils.jwt_utils import TokenDecodeError
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.side_effect = TokenDecodeError("Invalid signature")
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    mock_request,
                    mock_credentials,
                    mock_user_repository
                )
            
            assert exc_info.value.status_code == 401
            assert "Invalid token" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_raises_401_when_no_sub_or_email(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given token without sub or email, when authenticating, then raises 401."""
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = {}  # No sub or email
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    mock_request,
                    mock_credentials,
                    mock_user_repository
                )
            
            assert exc_info.value.status_code == 401
            assert "missing subject/email" in exc_info.value.detail


# =====================================================================# TEST: get_current_user - User Lookup
# =====================================================================
class TestGetCurrentUserLookup:
    """Tests for user lookup in get_current_user."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found_by_id(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given valid token with sub, when user exists by id, then returns user."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            result = await get_current_user(
                mock_request,
                mock_credentials,
                mock_user_repository
            )
            
            assert result["id"] == "user_123"
            mock_user_repository.get_by_id.assert_called_with("user_123")
    
    @pytest.mark.asyncio
    async def test_falls_back_to_email_when_id_not_found(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given user not found by id, when email exists, then finds by email."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = None
        mock_user_repository.get_by_email.return_value = user
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            result = await get_current_user(
                mock_request,
                mock_credentials,
                mock_user_repository
            )
            
            assert result["email"] == "user@example.com"
    
    @pytest.mark.asyncio
    async def test_raises_401_when_user_not_found(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given valid token but no user, when authenticating, then raises 401."""
        mock_user_repository.get_by_id.return_value = None
        mock_user_repository.get_by_email.return_value = None
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    mock_request,
                    mock_credentials,
                    mock_user_repository
                )
            
            assert exc_info.value.status_code == 401
            assert "User not found" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_handles_email_as_sub_claim(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given email in sub claim, when authenticating, then tries email lookup."""
        user = create_user()
        mock_user_repository.get_by_email.return_value = user
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = {"sub": "user@example.com", "email": None}
            
            result = await get_current_user(
                mock_request,
                mock_credentials,
                mock_user_repository
            )
            
            assert result is not None
            mock_user_repository.get_by_email.assert_called()

    @pytest.mark.asyncio
    async def test_uses_auth_cookie_when_header_missing(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given only an auth cookie, when authenticating, then resolves the user."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        mock_request.cookies = {"access_token": VALID_HS_TOKEN}

        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()

            result = await get_current_user(
                mock_request,
                credentials=None,
                user_repository=mock_user_repository,
                config=mock_config,
            )

            assert result["id"] == "user_123"
            mock_decode.assert_called_once_with(VALID_HS_TOKEN, mock_config)

    @pytest.mark.asyncio
    async def test_resolves_entra_user_by_tenant_and_object_id(
        self,
        mock_request,
        mock_credentials,
        mock_user_repository,
        mock_config,
    ):
        """Given an Entra access token, when authenticating, then resolves linked user."""
        mock_credentials.credentials = VALID_RS_TOKEN
        mock_config.entra_api_scope = "api://sonic-brief/access_as_user"
        mock_config.microsoft_client_id = "client-123"
        mock_config.microsoft_tenant_id = "tenant-123"
        mock_config.microsoft_jwks_timeout_seconds = 2.5
        linked_user = create_user(user_id="entra_user", email="entra@example.com")
        mock_user_repository.get_by_entra_identity.return_value = linked_user

        validator = MagicMock()
        validator.validate_access_token.return_value = {
            "tid": "tenant-123",
            "oid": "object-456",
            "preferred_username": "entra@example.com",
            "scp": "access_as_user",
            "azp": "client-123",
        }

        with patch("app.services.auth.identity_service.MicrosoftTokenValidator", return_value=validator) as validator_class:
            result = await get_current_user(
                mock_request,
                mock_credentials,
                mock_user_repository,
                mock_config,
            )

        assert result["id"] == "entra_user"
        assert result["auth_source"] == "entra"
        validator_class.assert_called_once()
        validator.validate_access_token.assert_called_once_with(VALID_RS_TOKEN)
        mock_user_repository.get_by_entra_identity.assert_called_once_with(
            tenant_id="tenant-123",
            object_id="object-456",
        )


class TestGetCurrentUserCrossRequestCaching:
    """Tests for cross-request auth result caching."""

    @pytest.mark.asyncio
    async def test_reuses_cached_user_for_same_token_and_repository(
        self,
        mock_user_repository,
        mock_config,
    ):
        first_request = MagicMock(spec=Request)
        first_request.state = MagicMock()
        first_request.state.current_user = None
        first_request.headers = {}
        first_request.cookies = {}
        first_request.app = MagicMock()
        first_request.app.state.config = mock_config

        second_request = MagicMock(spec=Request)
        second_request.state = MagicMock()
        second_request.state.current_user = None
        second_request.headers = {}
        second_request.cookies = {}
        second_request.app = MagicMock()
        second_request.app.state.config = mock_config

        mock_user_repository.get_by_id.return_value = create_user()

        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()

            first_result = await get_current_user(
                first_request,
                HTTPAuthorizationCredentials(scheme="Bearer", credentials=VALID_HS_TOKEN),
                mock_user_repository,
                mock_config,
            )
            second_result = await get_current_user(
                second_request,
                HTTPAuthorizationCredentials(scheme="Bearer", credentials=VALID_HS_TOKEN),
                mock_user_repository,
                mock_config,
            )

        assert first_result["id"] == "user_123"
        assert second_result["id"] == "user_123"
        assert mock_decode.call_count == 1
        mock_user_repository.get_by_id.assert_called_once_with("user_123")


# =====================================================================# TEST: get_current_user - Caching
# =====================================================================
class TestGetCurrentUserCaching:
    """Tests for user caching in get_current_user."""
    
    @pytest.mark.asyncio
    async def test_uses_cached_user_from_request_state(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given cached user in request, when authenticating, then returns cached."""
        cached_user = create_user(user_id="cached_user")
        mock_request.state.current_user = cached_user
        
        result = await get_current_user(
            mock_request,
            mock_credentials,
            mock_user_repository
        )
        
        assert result["id"] == "cached_user"
        # Should not call user repository
        mock_user_repository.get_by_id.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_caches_user_in_request_state(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given successful auth, when authenticating, then caches user."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            await get_current_user(
                mock_request,
                mock_credentials,
                mock_user_repository
            )
            
            assert mock_request.state.current_user is not None


# =====================================================================# TEST: get_current_user - Error Handling
# =====================================================================
class TestGetCurrentUserErrorHandling:
    """Tests for error handling in get_current_user."""
    
    @pytest.mark.asyncio
    async def test_handles_persistence_error(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given Cosmos persistence error, when authenticating, then raises 401."""
        mock_user_repository.get_by_id.side_effect = CosmosHttpResponseError(
            status_code=503,
            message="Service unavailable"
        )
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    mock_request,
                    mock_credentials,
                    mock_user_repository
                )
            
            assert exc_info.value.status_code == 401
            assert "Authentication service unavailable" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_handles_unexpected_error(
        self, mock_request, mock_credentials, mock_user_repository
    ):
        """Given unexpected error, when authenticating, then lets global handling own it."""
        mock_user_repository.get_by_id.side_effect = RuntimeError("Unexpected")
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(RuntimeError, match="Unexpected"):
                await get_current_user(
                    mock_request,
                    mock_credentials,
                    mock_user_repository
                )


# =====================================================================# TEST: get_current_user_sse - Token Sources
# =====================================================================
class TestGetCurrentUserSseTokenSources:
    """Tests for token source handling in get_current_user_sse."""
    
    @pytest.mark.asyncio
    async def test_uses_authorization_header(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given a bearer token, SSE auth uses the Authorization header."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        mock_request.headers = {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30."}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            result = await get_current_user_sse(
                mock_request,
                user_repository=mock_user_repository,
                config=mock_config,
            )
            
            assert result is not None
            mock_decode.assert_called_with("eyJhbGciOiJIUzI1NiJ9.e30.", mock_config)

    @pytest.mark.asyncio
    async def test_rejects_cookie_when_header_missing(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given only an auth cookie, SSE auth rejects the request."""
        mock_request.cookies = {"access_token": "cookie.token.here"}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_sse(
                    mock_request,
                    user_repository=mock_user_repository,
                    config=mock_config,
                )

            assert exc_info.value.status_code == 401
            assert "Missing authentication token" in exc_info.value.detail
            mock_decode.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_401_when_no_token_provided(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given no header or cookie token, SSE auth rejects the request."""
        mock_request.headers = {}
        mock_request.cookies = {}
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_sse(
                mock_request,
                user_repository=mock_user_repository,
                config=mock_config,
            )
        
        assert exc_info.value.status_code == 401
        assert "Missing authentication token" in exc_info.value.detail


# =====================================================================# TEST: get_current_user_sse - User Lookup
# =====================================================================
class TestGetCurrentUserSseLookup:
    """Tests for user lookup in get_current_user_sse."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given valid token, when user exists, then returns user."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        mock_request.headers = {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30."}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            result = await get_current_user_sse(
                mock_request,
                user_repository=mock_user_repository,
                config=mock_config,
            )
            
            assert result["id"] == "user_123"
    
    @pytest.mark.asyncio
    async def test_raises_401_when_user_not_found(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given valid token but no user, when authenticating, then raises 401."""
        mock_user_repository.get_by_id.return_value = None
        mock_user_repository.get_by_email.return_value = None
        mock_request.headers = {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30."}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_sse(
                    mock_request,
                    user_repository=mock_user_repository,
                    config=mock_config,
                )
            
            assert exc_info.value.status_code == 401
            assert "User not found" in exc_info.value.detail


# =====================================================================# TEST: get_current_user_sse - Error Handling
# =====================================================================
class TestGetCurrentUserSseErrorHandling:
    """Tests for error handling in get_current_user_sse."""
    
    @pytest.mark.asyncio
    async def test_raises_401_on_invalid_token(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given invalid token, when authenticating SSE, then raises 401."""
        from app.utils.jwt_utils import TokenDecodeError
        mock_request.headers = {"authorization": "Bearer expired.token"}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.side_effect = TokenDecodeError("Expired token")
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_sse(
                    mock_request,
                    user_repository=mock_user_repository,
                    config=mock_config,
                )
            
            assert exc_info.value.status_code == 401
            assert "Invalid token" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_handles_persistence_error(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given Cosmos persistence error, when authenticating SSE, then raises 401."""
        mock_user_repository.get_by_id.side_effect = CosmosHttpResponseError(
            status_code=503,
            message="Service unavailable"
        )
        mock_request.headers = {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30."}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_sse(
                    mock_request,
                    user_repository=mock_user_repository,
                    config=mock_config,
                )
            
            assert exc_info.value.status_code == 401
            assert "Authentication service unavailable" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_handles_unexpected_error(
        self, mock_request, mock_user_repository, mock_config
    ):
        """Given unexpected error, when authenticating SSE, then lets global handling own it."""
        mock_user_repository.get_by_id.side_effect = RuntimeError("Unexpected")
        mock_request.headers = {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30."}
        
        with patch("app.services.auth.identity_service.decode_token") as mock_decode:
            mock_decode.return_value = create_jwt_payload()
            
            with pytest.raises(RuntimeError, match="Unexpected"):
                await get_current_user_sse(
                    mock_request,
                    user_repository=mock_user_repository,
                    config=mock_config,
                )
