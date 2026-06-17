"""Authentication API routes."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from ....core.auth import get_current_user as get_current_user_dep
from ....core.config import AppConfig
from ....core.rate_limit import auth_mutation_limit, login_limit
from ....deps import get_analytics_service, get_app_config, get_user_repository
from ....repositories.users import UserRepository
from ....schemas.auth import LoginRequest
from ....services.auth.authentication_service import AuthenticationService


router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(auth_mutation_limit)])


def _auth_service(
    *,
    user_repository: UserRepository,
    config: AppConfig,
    analytics_service: Any | None = None,
) -> AuthenticationService:
    return AuthenticationService(
        user_repository=user_repository,
        config=config,
        analytics_service=analytics_service,
    )


@router.post("/login", dependencies=[Depends(login_limit)])
async def login_for_access_token(
    login_request: LoginRequest,
    user_repository: UserRepository = Depends(get_user_repository),
    config: AppConfig = Depends(get_app_config),
):
    if not config.password_login_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Password login is disabled",
        )

    result = await _auth_service(
        user_repository=user_repository,
        config=config,
    ).login(login_request)

    return JSONResponse(result.body)


@router.get("/me")
async def get_current_auth_profile(
    current_user: Dict[str, Any] = Depends(get_current_user_dep),
):
    """Return the authenticated Community Brief user resolved from Entra or password auth."""
    business_unit_id = current_user.get("business_unit_id")
    business_unit_ids = current_user.get("business_unit_ids", [])
    if not business_unit_ids and business_unit_id:
        business_unit_ids = [business_unit_id]

    return {
        "status": 200,
        "data": {
            "user_id": current_user.get("id"),
            "email": current_user.get("email"),
            "permission": current_user.get("permission", "User"),
            "transcription_method": current_user.get("transcription_method"),
            "business_unit_id": business_unit_id,
            "business_unit_ids": business_unit_ids,
            "business_unit_names": current_user.get("business_unit_names", []),
            "auth_source": current_user.get("auth_source", "entra"),
        },
    }


@router.post("/logout")
async def logout(
    current_user: Dict[str, Any] = Depends(get_current_user_dep),
):
    return {"status": 200, "message": "Logged out", "user_id": current_user.get("id")}
