"""User management routes."""

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, status

from ....core.auth import get_current_user, require_admin, require_editor, require_moderator
from ....core.rate_limit import standard_rate_limit
from ....deps import get_user_workflow_service
from ....schemas.users import (
    AddUserToBusinessUnitRequest,
    ChangePasswordRequest,
    RegisterUserRequest,
    SelfAssignToBusinessUnitRequest,
    UserUpdateRequest,
)
from ....services.users.user_workflow_service import UserWorkflowService

router = APIRouter(tags=["users"], dependencies=[Depends(standard_rate_limit)])


@router.get("/auth/users")
async def get_all_users(
    limit: int = Query(50, ge=1, le=100, description="Maximum number of users to return"),
    offset: int = Query(0, ge=0, description="Number of users to skip"),
    current_user: dict[str, Any] = Depends(require_editor),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.list_users(limit=limit, offset=offset)


@router.get("/auth/users/by-email")
async def get_user_by_email(
    email: str = Query(..., description="User's email address"),
    current_user: dict[str, Any] = Depends(require_editor),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.get_user_by_email(email)


@router.get("/auth/users/search")
async def search_users(
    query: str = Query("", description="Search term for email or name"),
    limit: int = Query(20, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.search_users(query=query, limit=limit, offset=offset)


@router.get("/auth/users/{user_id}")
async def get_user_by_id(
    user_id: str,
    current_user: dict[str, Any] = Depends(require_editor),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.get_user_by_id(user_id)


@router.post("/auth/users/register")
async def register_user(
    register_request: RegisterUserRequest,
    current_user: dict[str, Any] = Depends(require_moderator),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.register_user(
        register_request=register_request,
        current_user=current_user,
    )


@router.patch("/auth/users/{user_id}")
async def update_user(
    user_id: str,
    update_request: UserUpdateRequest,
    current_user: dict[str, Any] = Depends(require_admin),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.update_user(user_id=user_id, update_request=update_request)


@router.patch("/auth/users/{user_id}/password")
async def change_user_password(
    user_id: str,
    password_data: ChangePasswordRequest = Body(...),
    current_user: dict[str, Any] = Depends(require_admin),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, str]:
    return await workflow_service.change_user_password(
        user_id=user_id,
        password_data=password_data,
        current_user=current_user,
    )


@router.delete("/auth/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, str]:
    return await workflow_service.delete_user(user_id=user_id, current_user=current_user)


@router.post("/users/me/business-units", status_code=status.HTTP_200_OK)
async def self_assign_to_business_units(
    payload: SelfAssignToBusinessUnitRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.self_assign_to_business_units(
        payload=payload,
        current_user=current_user,
    )


@router.post("/users/add-to-business-unit", status_code=status.HTTP_200_OK)
async def add_user_to_business_unit(
    payload: AddUserToBusinessUnitRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: UserWorkflowService = Depends(get_user_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.add_user_to_business_unit(payload=payload, current_user=current_user)
