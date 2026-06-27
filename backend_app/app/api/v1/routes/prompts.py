from fastapi import APIRouter, Depends, Query
from typing import Dict, Any, Optional
from urllib.parse import unquote
from ....core.auth import get_current_user, require_user, require_editor
from ....core.rate_limit import standard_rate_limit
from ....deps import (
    get_prompt_service,
    get_talking_points_service,
    get_permission_service,
    get_user_service,
    get_prompt_version_service,
)
from ....services.users.user_service import UserService
from ....schemas.prompts import (
    AllPromptsResponse,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    PromptVersionDetailResponse,
    PromptVersionDiffResponse,
    PromptVersionListResponse,
    PromptVersionRollbackRequest,
    SubcategoryCreate,
    SubcategoryResponse,
    SubcategoryUpdate,
)
from ....services.interfaces import PromptServiceInterface, TalkingPointsServiceInterface
from ....services.prompts.prompt_category_service import PromptCategoryService
from ....services.prompts.prompt_read_service import PromptReadService
from ....services.prompts.prompt_subcategory_workflow_service import PromptSubcategoryWorkflowService
from ....services.prompts.prompt_version_service import PromptVersionService
from ....services.prompts.prompt_version_workflow_service import PromptVersionWorkflowService
from ....services.auth.permission_service import PermissionService

router = APIRouter(prefix="/prompts", tags=["prompts"], dependencies=[Depends(standard_rate_limit)])


# Category CRUD operations
@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
) -> Dict[str, Any]:
    return await PromptCategoryService(
        prompt_service=prompt_service,
        permission_service=perm_service,
    ).create_category(
        name=category.name,
        parent_category_id=getattr(category, "parent_category_id", None),
        current_user=current_user,
    )


@router.get("/categories")
async def list_categories(
    limit: int = Query(50, ge=1, le=100, description="Maximum number of categories to return"),
    offset: int = Query(0, ge=0, description="Number of categories to skip"),
    current_user: dict = Depends(get_current_user), 
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
):
    return await PromptCategoryService(
        prompt_service=prompt_service,
    ).list_categories(limit=limit, offset=offset)


@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: str, 
    current_user: dict = Depends(get_current_user), 
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
) -> Dict[str, Any]:
    return await PromptCategoryService(
        prompt_service=prompt_service,
    ).get_category(category_id)


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    category: CategoryUpdate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    user_service: UserService = Depends(get_user_service),
) -> Dict[str, Any]:
    return await PromptCategoryService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        user_service=user_service,
    ).update_category(
        category_id=category_id,
        name=category.name,
        parent_category_id=getattr(category, "parent_category_id", None),
        current_user=current_user,
    )


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    user_service: UserService = Depends(get_user_service),
) -> Dict[str, Any]:
    return await PromptCategoryService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        user_service=user_service,
    ).delete_category(
        category_id=category_id,
        current_user=current_user,
    )


@router.post("/subcategories", response_model=SubcategoryResponse)
async def create_subcategory(
    subcategory: SubcategoryCreate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
) -> Dict[str, Any]:
    return await PromptSubcategoryWorkflowService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    ).create_subcategory(
        subcategory=subcategory,
        current_user=current_user,
    )


@router.get("/subcategories")
async def list_subcategories(
    category_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100, description="Maximum number of subcategories to return"),
    offset: int = Query(0, ge=0, description="Number of subcategories to skip"),
    include_hidden: bool = Query(False, description="Include subcategories hidden by visible_to_user_ids (management mode)"),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
):
    return await PromptReadService(
        prompt_service=prompt_service,
        talking_points_service=talking_points_service,
    ).list_subcategories(
        category_id=category_id,
        limit=limit,
        offset=offset,
        include_hidden=include_hidden,
        current_user=current_user,
    )


@router.get("/subcategories/{subcategory_id}", response_model=SubcategoryResponse)
async def get_subcategory(
    subcategory_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
) -> Dict[str, Any]:
    return await PromptReadService(
        prompt_service=prompt_service,
        talking_points_service=talking_points_service,
    ).get_subcategory(
        subcategory_id=subcategory_id,
        current_user=current_user,
    )


@router.put("/subcategories/{subcategory_id:path}")
async def update_subcategory(
    subcategory_id: str,
    subcategory: SubcategoryUpdate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptSubcategoryWorkflowService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    ).update_subcategory(
        subcategory_id=decoded_id,
        subcategory=subcategory,
        current_user=current_user,
    )


@router.patch("/subcategories/{subcategory_id:path}/move")
async def move_subcategory(
    subcategory_id: str,
    new_category_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptSubcategoryWorkflowService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    ).move_subcategory(
        subcategory_id=decoded_id,
        new_category_id=new_category_id,
        current_user=current_user,
    )


@router.delete("/subcategories/{subcategory_id:path}")
async def delete_subcategory(
    subcategory_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptSubcategoryWorkflowService(
        prompt_service=prompt_service,
        permission_service=perm_service,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    ).delete_subcategory(
        subcategory_id=decoded_id,
        current_user=current_user,
    )


@router.get("/subcategories/{subcategory_id:path}/versions", response_model=PromptVersionListResponse)
async def list_subcategory_versions(
    subcategory_id: str,
    limit: int = Query(25, ge=1, le=100, description="Maximum number of versions to return"),
    offset: int = Query(0, ge=0, description="Number of versions to skip"),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
    perm_service: PermissionService = Depends(get_permission_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=prompt_version_service,
        permission_service=perm_service,
    ).list_versions(subcategory_id=decoded_id, limit=limit, offset=offset, current_user=current_user)


@router.get("/subcategories/{subcategory_id:path}/versions/by-id/{version_id}", response_model=PromptVersionDetailResponse)
async def get_subcategory_version(
    subcategory_id: str,
    version_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
    perm_service: PermissionService = Depends(get_permission_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=prompt_version_service,
        permission_service=perm_service,
    ).get_version(subcategory_id=decoded_id, version_id=version_id, current_user=current_user)


@router.get("/subcategories/{subcategory_id:path}/versions/diff", response_model=PromptVersionDiffResponse)
async def diff_subcategory_versions(
    subcategory_id: str,
    left: str = Query(..., description="Left version id or 'current'"),
    right: str = Query(..., description="Right version id or 'current'"),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
    perm_service: PermissionService = Depends(get_permission_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=prompt_version_service,
        permission_service=perm_service,
    ).diff_versions(subcategory_id=decoded_id, left=left, right=right, current_user=current_user)


@router.post("/subcategories/{subcategory_id:path}/versions/{version_id}/rollback", response_model=SubcategoryResponse)
async def rollback_subcategory_version(
    subcategory_id: str,
    version_id: str,
    rollback_request: PromptVersionRollbackRequest,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
    perm_service: PermissionService = Depends(get_permission_service),
    talking_points_service: TalkingPointsServiceInterface = Depends(get_talking_points_service),
    prompt_version_service: PromptVersionService = Depends(get_prompt_version_service),
) -> Dict[str, Any]:
    decoded_id = unquote(subcategory_id)
    return await PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=prompt_version_service,
        permission_service=perm_service,
        talking_points_service=talking_points_service,
    ).rollback_to_version(
        subcategory_id=decoded_id,
        version_id=version_id,
        reason=rollback_request.reason,
        current_user=current_user,
    )


# Hierarchical API for retrieving all data

@router.get("/retrieve_prompts", response_model=AllPromptsResponse)
async def retrieve_prompts(
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    prompt_service: PromptServiceInterface = Depends(get_prompt_service),
) -> Dict[str, Any]:
    return await PromptReadService(
        prompt_service=prompt_service,
    ).retrieve_prompts(current_user=current_user)
