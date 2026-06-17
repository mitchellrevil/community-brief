"""Business unit routes."""

from typing import Any

from fastapi import APIRouter, Depends, Query, status

from ....core.auth import get_current_user
from ....core.rate_limit import standard_rate_limit
from ....deps import get_business_unit_workflow_service
from ....schemas.business_units import (
    BulkUserUpdate,
    BulkUserUpdateResponse,
    BusinessUnitCreate,
    BusinessUnitListResponse,
    BusinessUnitResponse,
    BusinessUnitStats,
    BusinessUnitUpdate,
    UserBusinessUnitAssignment,
    UserBusinessUnitAssignmentResponse,
)
from ....services.prompts.business_unit_workflow_service import BusinessUnitWorkflowService

router = APIRouter(prefix="/business-units", tags=["business-units"], dependencies=[Depends(standard_rate_limit)])


@router.post("", response_model=BusinessUnitResponse, status_code=status.HTTP_201_CREATED)
async def create_business_unit(
    business_unit: BusinessUnitCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BusinessUnitResponse:
    return await workflow_service.create_business_unit(
        business_unit=business_unit,
        current_user=current_user,
    )


@router.get("", response_model=BusinessUnitListResponse)
async def list_business_units(
    limit: int = Query(50, ge=1, le=100, description="Maximum number of business units to return"),
    offset: int = Query(0, ge=0, description="Number of business units to skip"),
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BusinessUnitListResponse:
    return await workflow_service.list_business_units(
        limit=limit,
        offset=offset,
    )


@router.post("/assign-user", response_model=UserBusinessUnitAssignmentResponse)
async def assign_user_to_business_unit(
    assignment: UserBusinessUnitAssignment,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> UserBusinessUnitAssignmentResponse:
    return await workflow_service.assign_user_to_business_unit(
        assignment=assignment,
        current_user=current_user,
    )


@router.post("/bulk-update-users", response_model=BulkUserUpdateResponse)
async def bulk_update_users(
    bulk_update: BulkUserUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BulkUserUpdateResponse:
    return await workflow_service.bulk_update_users(bulk_update=bulk_update, current_user=current_user)


@router.get("/{business_unit_id}", response_model=BusinessUnitResponse)
async def get_business_unit(
    business_unit_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BusinessUnitResponse:
    return await workflow_service.get_business_unit(
        business_unit_id=business_unit_id,
        current_user=current_user,
    )


@router.put("/{business_unit_id}", response_model=BusinessUnitResponse)
async def update_business_unit(
    business_unit_id: str,
    business_unit: BusinessUnitUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BusinessUnitResponse:
    return await workflow_service.update_business_unit(
        business_unit_id=business_unit_id,
        business_unit=business_unit,
        current_user=current_user,
    )


@router.get("/{business_unit_id}/stats", response_model=BusinessUnitStats)
async def get_business_unit_stats(
    business_unit_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: BusinessUnitWorkflowService = Depends(get_business_unit_workflow_service),
) -> BusinessUnitStats:
    return await workflow_service.get_business_unit_stats(
        business_unit_id=business_unit_id,
        current_user=current_user,
    )
