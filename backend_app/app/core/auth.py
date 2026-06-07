from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from azure.cosmos.exceptions import CosmosHttpResponseError

from .config import AppConfig
from .cosmos import CosmosService, get_cosmos_service
from .errors.domain import ApplicationError, AuthenticationError, ErrorCode
from .logging import get_logger
from ..models.permissions import (
    PERMISSION_HIERARCHY,
    PermissionLevel,
    get_permission_level,
    has_permission_level,
)
from ..repositories.users import UserRepository
from ..services.auth.identity_service import AuthIdentityService
from ..utils.cache_utils import TTLCache

logger = get_logger(__name__)

security = HTTPBearer(auto_error=False)
ACCESS_COOKIE_NAME = "access_token"
_resolved_auth_user_cache = TTLCache[Dict[str, Any]](default_ttl=600.0)


async def clear_resolved_auth_user_cache(token: str | None = None) -> None:
    """Clear the shared resolved-user cache.

    When a token is provided, only matching entries are removed. Otherwise the
    entire cache is cleared. This is primarily useful for tests and cache
    invalidation hooks.
    """
    if token is None:
        await _resolved_auth_user_cache.clear()
        return
    await _resolved_auth_user_cache.invalidate(f"token:{token}")

def get_app_config(request: Request) -> AppConfig:
    """Return the application configuration instance from app state."""
    return request.app.state.config


def _get_token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    if credentials and credentials.credentials:
        return credentials.credentials
    return request.cookies.get(ACCESS_COOKIE_NAME)


# === Authentication Dependencies ===
def get_user_repository(
    request: Request,
    cosmos_service: CosmosService = Depends(get_cosmos_service),
) -> UserRepository:
    """Provide user persistence for authentication dependencies."""
    state_repository = getattr(request.app.state, "__dict__", {}).get("user_repository")
    if isinstance(state_repository, UserRepository):
        return state_repository
    return UserRepository(cosmos_service, permission_cache=request.app.state.permission_cache)


async def _resolve_current_user_from_token(
    request: Request,
    token: str,
    user_repository: UserRepository,
    config: AppConfig,
) -> Dict[str, Any]:
    cached_user = getattr(request.state, "current_user", None)
    if cached_user is not None:
        return cached_user

    # Token resolution only depends on the token itself; keeping the key token-only
    # avoids accidental cache misses when request-scoped dependency objects differ.
    cache_key = f"token:{token}"
    cached_user = await _resolved_auth_user_cache.get(cache_key)
    if cached_user is not None:
        request.state.current_user = copy.deepcopy(cached_user)
        return request.state.current_user

    if not hasattr(config, "jwt_algorithm"):
        config = get_app_config(request)

    user = await AuthIdentityService(
        user_repository=user_repository,
        config=config,
    ).resolve_bearer_token(token)
    cached_copy = copy.deepcopy(user)
    await _resolved_auth_user_cache.set(cache_key, cached_copy)
    request.state.current_user = user
    return user


async def _authenticate_request(
    request: Request,
    token: Optional[str],
    user_repository: UserRepository,
    config: AppConfig,
    *,
    missing_token_detail: str = "Missing authentication token",
    persistence_log_event: str = "auth.user_lookup_cosmos_failed",
) -> Dict[str, Any]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=missing_token_detail,
        )

    try:
        return await _resolve_current_user_from_token(request, token, user_repository, config)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
        ) from e
    except HTTPException:
        raise
    except CosmosHttpResponseError as e:
        logger.error(
            persistence_log_event,
            status_code=e.status_code,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication service unavailable",
        ) from e


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    user_repository: UserRepository = Depends(get_user_repository),
    config: AppConfig = Depends(get_app_config),
) -> Dict[str, Any]:
    """Get the current authenticated user from a bearer token or auth cookie."""
    token = _get_token_from_request(request, credentials)
    return await _authenticate_request(request, token, user_repository, config)


async def get_current_user_sse(
    request: Request,
    user_repository: UserRepository = Depends(get_user_repository),
    config: AppConfig = Depends(get_app_config),
) -> Dict[str, Any]:
    """
    Get current authenticated user for SSE endpoints.
    Accepts token from the Authorization header.
    """
    auth_header = request.headers.get("authorization", "")
    auth_token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    return await _authenticate_request(
        request,
        auth_token,
        user_repository,
        config,
        persistence_log_event="auth.sse_user_lookup_cosmos_failed",
    )


@dataclass
class PermissionContext:
    """Request-scoped permission context."""

    user: Dict[str, Any]
    permission_level: int
    permission_str: str
    is_admin: bool = False
    is_editor: bool = False

    @property
    def user_id(self) -> str:
        return self.user.get("id", "")

    @property
    def email(self) -> str:
        return self.user.get("email", "")


async def get_permission_context(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> PermissionContext:
    """Resolve and memoize the current user's permission context."""
    if hasattr(request.state, "permission_context"):
        return request.state.permission_context

    user_permission = current_user.get("permission", "User")
    level = get_permission_level(user_permission)

    ctx = PermissionContext(
        user=current_user,
        permission_level=level,
        permission_str=user_permission,
        is_admin=level >= PERMISSION_HIERARCHY.get(PermissionLevel.ADMIN.value, 0),
        is_editor=level >= PERMISSION_HIERARCHY.get(PermissionLevel.EDITOR.value, 0),
    )
    request.state.permission_context = ctx
    return ctx


def get_assigned_business_unit_ids(current_user: Dict[str, Any]) -> List[str]:
    """Return the caller's assigned business unit IDs."""
    business_unit_ids = current_user.get("business_unit_ids") or []
    return list(dict.fromkeys(business_unit_id for business_unit_id in business_unit_ids if business_unit_id))


def resolve_analytics_business_unit_scope(
    current_user: Dict[str, Any],
    requested_business_unit_id: Optional[str] = None,
    *,
    empty_assignment_message: str = "Editor account not assigned to any business units. Contact administrator.",
    insufficient_permission_message: str = "Analytics access requires Editor, Moderator, or Admin permission",
) -> Optional[List[str]]:
    """Resolve the business-unit scope allowed for analytics and exports."""
    user_permission = current_user.get("permission", "")

    if has_permission_level(user_permission, PermissionLevel.ADMIN.value):
        return [requested_business_unit_id] if requested_business_unit_id else None

    if has_permission_level(user_permission, PermissionLevel.EDITOR.value):
        assigned_business_unit_ids = get_assigned_business_unit_ids(current_user)
        if not assigned_business_unit_ids:
            raise ApplicationError(
                empty_assignment_message,
                error_code=ErrorCode.FORBIDDEN,
                status_code=403,
            )

        if requested_business_unit_id:
            if requested_business_unit_id not in assigned_business_unit_ids:
                raise ApplicationError(
                    f"You do not have access to business unit: {requested_business_unit_id}",
                    error_code=ErrorCode.FORBIDDEN,
                    status_code=403,
                    details={"business_unit_id": requested_business_unit_id},
                )
            return [requested_business_unit_id]

        return assigned_business_unit_ids

    raise ApplicationError(
        insufficient_permission_message,
        error_code=ErrorCode.FORBIDDEN,
        status_code=403,
    )


async def require_permission(
    required_permission: PermissionLevel,
    context: PermissionContext = Depends(get_permission_context),
) -> Dict[str, Any]:
    """Require the current user to have the requested hierarchical permission."""
    required_level = PERMISSION_HIERARCHY.get(required_permission.value, 0)
    if context.permission_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Insufficient permissions. Required: {required_permission.value}, "
                f"User has: {context.permission_str}"
            ),
        )
    return context.user


def create_permission_dependency(required_permission: PermissionLevel):
    async def permission_dependency(
        context: PermissionContext = Depends(get_permission_context),
    ) -> Dict[str, Any]:
        return await require_permission(required_permission, context)

    return permission_dependency


require_admin = create_permission_dependency(PermissionLevel.ADMIN)
require_editor = create_permission_dependency(PermissionLevel.EDITOR)
require_user = create_permission_dependency(PermissionLevel.USER)
require_moderator = create_permission_dependency(PermissionLevel.MODERATOR)
