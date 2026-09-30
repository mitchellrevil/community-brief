from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, Query, Response, status
from fastapi.responses import StreamingResponse

from ....core.auth import get_current_user, require_editor, require_user
from ....core.rate_limit import standard_rate_limit
from ....deps import get_prompt_agent_service, get_prompt_catalog
from ....models.pagination import PaginatedResponse
from ....schemas.prompt_catalog import (
    PromptTemplateCreate,
    PromptTemplatePatch,
    PromptTemplateResponse,
    PromptCatalogView,
    PromptFolderCreate,
    PromptFolderPatch,
    PromptFolderResponse,
    PromptVersionDetailResponse,
    PromptVersionDiffResponse,
    PromptVersionMetadataResponse,
    PromptVersionRestoreRequest,
)
from ....services.jobs.job_analysis_workflow_service import STREAM_HEADERS
from ....services.prompts.prompt_agent_service import PromptAgentService
from ....services.prompts.prompt_catalog import PromptCatalog


router = APIRouter(dependencies=[Depends(standard_rate_limit)])


@router.get(
    "/folders",
    response_model=PaginatedResponse[PromptFolderResponse],
    tags=["templates"],
)
async def list_prompt_folders(
    view: PromptCatalogView = Query("runtime"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.list_folders(
        view=view, limit=limit, offset=offset, current_user=current_user
    )


@router.post(
    "/folders",
    response_model=PromptFolderResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["templates"],
)
async def create_prompt_folder(
    request: PromptFolderCreate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.create_folder(
        name=request.name, parent_id=request.parent_id, current_user=current_user
    )


@router.get(
    "/folders/{folder_id}",
    response_model=PromptFolderResponse,
    tags=["templates"],
)
async def get_prompt_folder(
    folder_id: str,
    view: PromptCatalogView = Query("runtime"),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.get_folder(folder_id, view=view, current_user=current_user)


@router.patch(
    "/folders/{folder_id}",
    response_model=PromptFolderResponse,
    tags=["templates"],
)
async def update_prompt_folder(
    folder_id: str,
    request: PromptFolderPatch,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.update_folder(
        folder_id, patch=request, current_user=current_user
    )


@router.delete(
    "/folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["templates"],
)
async def delete_prompt_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Response:
    await catalog.delete_folder(folder_id, current_user=current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/templates",
    response_model=PaginatedResponse[PromptTemplateResponse],
    tags=["templates"],
)
async def list_templates(
    folder_id: Optional[str] = None,
    view: PromptCatalogView = Query("runtime"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.list_templates(
        folder_id=folder_id,
        view=view,
        limit=limit,
        offset=offset,
        current_user=current_user,
    )


@router.post(
    "/templates",
    response_model=PromptTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["templates"],
)
async def create_template(
    request: PromptTemplateCreate,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.create_template(request, current_user=current_user)


@router.get(
    "/templates/{template_id}",
    response_model=PromptTemplateResponse,
    tags=["templates"],
)
async def get_template(
    template_id: str,
    view: PromptCatalogView = Query("runtime"),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_user),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.get_template(
        template_id, view=view, current_user=current_user
    )


@router.patch(
    "/templates/{template_id}",
    response_model=PromptTemplateResponse,
    tags=["templates"],
)
async def update_template(
    template_id: str,
    request: PromptTemplatePatch,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.update_template(
        template_id, patch=request, current_user=current_user
    )


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["templates"],
)
async def delete_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Response:
    await catalog.delete_template(template_id, current_user=current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/templates/{template_id}/versions",
    response_model=PaginatedResponse[PromptVersionMetadataResponse],
    tags=["templates"],
)
async def list_template_versions(
    template_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.list_versions(
        template_id,
        limit=limit,
        offset=offset,
        current_user=current_user,
    )


@router.get(
    "/templates/{template_id}/versions/compare",
    response_model=PromptVersionDiffResponse,
    tags=["templates"],
)
async def compare_template_versions(
    template_id: str,
    left: str = Query(...),
    right: str = Query(...),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.compare_versions(
        template_id, left=left, right=right, current_user=current_user
    )


@router.get(
    "/templates/{template_id}/versions/{version_id}",
    response_model=PromptVersionDetailResponse,
    tags=["templates"],
)
async def get_template_version(
    template_id: str,
    version_id: str,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.get_version(
        template_id, version_id, current_user=current_user
    )


@router.post(
    "/templates/{template_id}/restorations",
    response_model=PromptTemplateResponse,
    tags=["templates"],
)
async def restore_template_version(
    template_id: str,
    request: PromptVersionRestoreRequest,
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    catalog: PromptCatalog = Depends(get_prompt_catalog),
) -> Dict[str, Any]:
    return await catalog.restore_version(
        template_id,
        request.version_id,
        reason=request.reason,
        current_user=current_user,
    )


@router.post("/agent-runs", tags=["prompt agent"])
async def create_agent_run(
    folder_id: str = Body(..., min_length=1),
    template_id: Optional[str] = Body(None),
    messages: Optional[list[dict[str, Any]]] = Body(None),
    max_tokens: int = Body(2000, ge=100, le=4000),
    thread_id: Optional[str] = Body(None),
    run_id: Optional[str] = Body(None),
    state: Optional[dict[str, Any]] = Body(None),
    resume: Any = Body(None),
    current_user: dict = Depends(get_current_user),
    auth_context: str = Depends(require_editor),
    agent: PromptAgentService = Depends(get_prompt_agent_service),
) -> StreamingResponse:
    return StreamingResponse(
        agent.stream_prompt_agent(
            folder_id=folder_id,
            template_id=template_id,
            max_tokens=max_tokens,
            current_user=current_user,
            ag_ui_messages=messages,
            thread_id=thread_id,
            run_id=run_id,
            state=state,
            resume=resume,
        ),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )
