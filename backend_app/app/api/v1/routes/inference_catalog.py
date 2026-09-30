"""Authenticated inference catalog endpoints."""

from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from ....core.auth import require_admin, require_user
from ....core.rate_limit import admin_mutation_limit, standard_rate_limit
from ....deps import get_inference_catalog_service, get_inference_connection_service
from ....schemas.inference_catalog import (
    InferenceCatalog,
    ModelConnectionRequest,
    ModelConnectionResult,
)
from ....services.inference_catalog_service import InferenceCatalogService
from ....services.inference_connection_service import InferenceConnectionService

router = APIRouter(tags=["inference"])


@router.post(
    "/admin/inference/test-connection",
    response_model=ModelConnectionResult,
    dependencies=[Depends(admin_mutation_limit)],
)
async def test_model_connection(
    request: ModelConnectionRequest,
    _current_user: Dict[str, Any] = Depends(require_admin),
    service: InferenceConnectionService = Depends(get_inference_connection_service),
) -> ModelConnectionResult:
    return await service.test_connection(request)


@router.get("/inference/catalog", dependencies=[Depends(standard_rate_limit)])
async def get_inference_catalog(
    response: Response,
    _current_user: Dict[str, Any] = Depends(require_user),
    service: InferenceCatalogService = Depends(get_inference_catalog_service),
) -> Dict[str, Any]:
    catalog, etag = await service.get_catalog()
    if etag:
        response.headers["ETag"] = etag
    return catalog.public_dict()


@router.put("/admin/inference/catalog", dependencies=[Depends(admin_mutation_limit)])
async def update_inference_catalog(
    catalog: InferenceCatalog,
    response: Response,
    if_match: str = Header(..., alias="If-Match"),
    _current_user: Dict[str, Any] = Depends(require_admin),
    service: InferenceCatalogService = Depends(get_inference_catalog_service),
) -> Dict[str, Any]:
    try:
        updated, etag = await service.update_catalog(catalog, if_match=if_match)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if etag:
        response.headers["ETag"] = etag
    return updated.public_dict()
