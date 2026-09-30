"""Inference catalog persistence, lifecycle, and parameter validation."""

from __future__ import annotations

from typing import Any, Dict, Optional

from azure.cosmos.exceptions import CosmosHttpResponseError

from ..repositories.prompts import PromptRepository
from ..schemas.inference_catalog import INITIAL_INFERENCE_CATALOG, InferenceCatalog


class InferenceCatalogService:
    def __init__(self, repository: PromptRepository) -> None:
        self.repository = repository

    async def get_catalog(self) -> tuple[InferenceCatalog, Optional[str]]:
        document = await self.repository.get_inference_catalog()
        if not document:
            return INITIAL_INFERENCE_CATALOG.model_copy(deep=True), None
        return InferenceCatalog.model_validate(document), document.get("_etag")

    async def ensure_seeded(self) -> InferenceCatalog:
        """Create the canonical seed once; tolerate a concurrent app startup."""
        document = await self.repository.get_inference_catalog()
        if document:
            return InferenceCatalog.model_validate(document)
        try:
            saved = await self.repository.save_inference_catalog(
                INITIAL_INFERENCE_CATALOG.model_dump(mode="json"), etag=None
            )
        except Exception:
            document = await self.repository.get_inference_catalog()
            if not document:
                raise
            return InferenceCatalog.model_validate(document)
        return InferenceCatalog.model_validate(saved)

    async def update_catalog(
        self, catalog: InferenceCatalog, *, if_match: str
    ) -> tuple[InferenceCatalog, str]:
        current, current_etag = await self.get_catalog()
        default = catalog.model(catalog.default_model)
        if not default or default.effective_status() != "active":
            raise ValueError(
                "Choose an active default model before retiring the current default"
            )
        if current_etag is None:
            if if_match != "*":
                raise RuntimeError("Initial catalog creation requires If-Match: *")
        elif if_match != current_etag:
            raise RuntimeError("Inference catalog has changed; reload and retry")
        if current_etag and catalog.version <= current.version:
            raise ValueError("Catalog version must increase")

        removed = sorted(
            {model.key for model in current.models}
            - {model.key for model in catalog.models}
        )
        if removed:
            referenced = {
                key: count
                for key, count in (
                    await self.repository.count_model_references(removed)
                ).items()
                if count
            }
            if referenced:
                raise ValueError(
                    "Referenced models must be deprecated or disabled before removal: "
                    + ", ".join(f"{key} ({count})" for key, count in referenced.items())
                )

        try:
            saved = await self.repository.save_inference_catalog(
                catalog.model_dump(mode="json"), etag=current_etag
            )
        except CosmosHttpResponseError as exc:
            if exc.status_code in {409, 412}:
                raise RuntimeError(
                    "Inference catalog has changed; reload and retry"
                ) from exc
            raise
        return InferenceCatalog.model_validate(saved), saved.get("_etag", "")

    async def validate_configuration(
        self,
        *,
        model_key: Optional[str],
        provider: Optional[str],
        parameters: Optional[Dict[str, Any]],
        allow_deprecated: bool = False,
    ) -> tuple[str, str, Dict[str, Any]]:
        catalog, _ = await self.get_catalog()
        model_key = model_key or catalog.default_model
        model = catalog.model(model_key)
        if not model:
            raise ValueError(f'Unknown analysis model "{model_key}"')
        status = model.effective_status()
        if status in {"disabled", "retired"}:
            raise ValueError(
                f"{model.display_name} is {status}; select its replacement"
            )
        if status == "deprecated" and not allow_deprecated:
            raise ValueError(
                f"{model.display_name} is deprecated; select its replacement"
            )
        if provider and provider != model.provider:
            raise ValueError(
                f'Provider "{provider}" is not valid for {model.display_name}'
            )

        values = dict(parameters or {})
        model.validate_parameters(values)
        return model.key, model.provider, values
