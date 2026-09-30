from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.schemas.inference_catalog import (
    INITIAL_INFERENCE_CATALOG,
    CatalogModel,
    CatalogParameter,
    InferenceCatalog,
)
from app.services.inference_catalog_service import InferenceCatalogService


def test_initial_catalog_defaults_to_gpt_5_4_and_reports_retirements():
    payload = INITIAL_INFERENCE_CATALOG.public_dict(datetime(2026, 7, 17, tzinfo=UTC))
    assert payload["default_model"] == "gpt-5.4"
    assert {warning["model_key"] for warning in payload["lifecycle_warnings"]} == {
        "gpt-4o",
        "gpt-4.1",
    }


@pytest.mark.asyncio
async def test_catalog_validation_rejects_arbitrary_and_conflicting_kwargs():
    repository = AsyncMock()
    repository.get_inference_catalog.return_value = None
    service = InferenceCatalogService(repository)

    with pytest.raises(ValueError, match="Unsupported parameters"):
        await service.validate_configuration(
            model_key="gpt-5.4", provider="responses", parameters={"input": "unsafe"}
        )
    with pytest.raises(ValueError, match="cannot be used together"):
        await service.validate_configuration(
            model_key="gpt-5.4",
            provider="responses",
            parameters={"reasoning_effort": "none", "temperature": 1, "top_p": 0.9},
        )


@pytest.mark.asyncio
async def test_referenced_models_cannot_be_removed():
    repository = AsyncMock()
    current = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    current["_etag"] = "v1"
    repository.get_inference_catalog.return_value = current
    repository.count_model_references.return_value = {"gpt-4o-mini": 2}
    service = InferenceCatalogService(repository)
    updated = INITIAL_INFERENCE_CATALOG.model_copy(deep=True)
    updated.version = 2
    updated.models = [model for model in updated.models if model.key != "gpt-4o-mini"]

    with pytest.raises(ValueError, match="Referenced models"):
        await service.update_catalog(updated, if_match="v1")


@pytest.mark.asyncio
async def test_catalog_seed_is_created_once():
    repository = AsyncMock()
    repository.get_inference_catalog.return_value = None
    seeded = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    seeded["_etag"] = "seed"
    repository.save_inference_catalog.return_value = seeded

    result = await InferenceCatalogService(repository).ensure_seeded()

    assert result.default_model == "gpt-5.4"
    repository.save_inference_catalog.assert_awaited_once()


@pytest.mark.asyncio
async def test_catalog_update_requires_current_etag():
    repository = AsyncMock()
    current = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    current["_etag"] = "v1"
    repository.get_inference_catalog.return_value = current
    updated = INITIAL_INFERENCE_CATALOG.model_copy(deep=True)
    updated.version = 2

    with pytest.raises(RuntimeError, match="reload and retry"):
        await InferenceCatalogService(repository).update_catalog(
            updated, if_match="stale"
        )


def test_lifecycle_warning_window_includes_exactly_ninety_days():
    catalog = INITIAL_INFERENCE_CATALOG.model_copy(deep=True)
    model = catalog.model("gpt-5.4")
    assert model is not None
    now = datetime(2026, 7, 17, tzinfo=UTC)
    model.deprecates_at = datetime(2026, 10, 15, tzinfo=UTC)
    assert any(
        warning["model_key"] == "gpt-5.4"
        for warning in catalog.public_dict(now)["lifecycle_warnings"]
    )

    model.deprecates_at = datetime(2026, 10, 16, tzinfo=UTC)
    assert not any(
        warning["model_key"] == "gpt-5.4"
        for warning in catalog.public_dict(now)["lifecycle_warnings"]
    )


@pytest.mark.parametrize(
    "kind,value",
    [
        ("boolean", True),
        ("string", "flex"),
        ("object", {"effort": "high"}),
        ("array", [1, "two"]),
        ("enum", 1),
        ("integer", 12),
        ("number", 0.5),
    ],
)
@pytest.mark.asyncio
async def test_new_model_parameters_round_trip_without_allowlist(kind, value):
    catalog = INITIAL_INFERENCE_CATALOG.model_copy(deep=True)
    catalog.models.append(
        CatalogModel(
            key="future-model",
            display_name="Future model",
            deployment="blue",
            provider="responses",
            parameters={
                "new_option": CatalogParameter(
                    kind=kind,
                    label="Option",
                    description="New parameter",
                    values=[1, 2] if kind == "enum" else None,
                )
            },
        )
    )
    repository = AsyncMock()
    repository.get_inference_catalog.return_value = catalog.model_dump(mode="json")
    key, provider, overrides = await InferenceCatalogService(
        repository
    ).validate_configuration(
        model_key="future-model", provider="responses", parameters={"new_option": value}
    )
    assert (key, provider, overrides) == (
        "future-model",
        "responses",
        {"new_option": value},
    )


@pytest.mark.parametrize(
    "kind,value",
    [
        ("integer", True),
        ("integer", 1.5),
        ("number", float("nan")),
        ("boolean", "true"),
        ("object", []),
        ("array", {}),
        ("string", 5),
        ("enum", True),
    ],
)
def test_parameter_types_are_strict(kind, value):
    parameter = CatalogParameter(
        kind=kind,
        label="Option",
        description="",
        values=[1, 2] if kind == "enum" else None,
    )
    with pytest.raises(ValueError):
        parameter.validate_value(value)


@pytest.mark.parametrize(
    "reserved",
    [
        "model",
        "input",
        "messages",
        "instructions",
        "api_key",
        "base_url",
        "extra_body",
        "extra_headers",
        "tools",
        "stream",
        "background",
    ],
)
def test_admin_arguments_cannot_replace_managed_request_fields(reserved):
    with pytest.raises(ValueError, match="managed by Community Brief"):
        CatalogModel(
            key="new",
            display_name="New",
            deployment="new",
            provider="responses",
            request_defaults={reserved: "override"},
        )


@pytest.mark.asyncio
async def test_expired_default_can_be_read_and_repaired():
    payload = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    payload["_etag"] = "old"
    next(item for item in payload["models"] if item["key"] == payload["default_model"])[
        "retires_at"
    ] = "2020-01-01T00:00:00Z"
    repository = AsyncMock()
    repository.get_inference_catalog.return_value = payload
    service = InferenceCatalogService(repository)
    catalog, etag = await service.get_catalog()
    assert etag == "old"
    assert catalog.model(catalog.default_model).effective_status() == "retired"
    catalog.version += 1
    with pytest.raises(ValueError, match="active default"):
        await service.update_catalog(catalog, if_match=etag)
    catalog.default_model = "gpt-4o-mini"
    repository.save_inference_catalog.return_value = {
        **catalog.model_dump(mode="json"),
        "_etag": "new",
    }
    updated, _ = await service.update_catalog(catalog, if_match=etag)
    assert updated.default_model == "gpt-4o-mini"


def test_catalog_rejects_naive_dates_and_conflicting_defaults():
    payload = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    payload["models"][0]["retires_at"] = "2026-10-01T00:00:00"
    with pytest.raises(ValueError):
        InferenceCatalog.model_validate(payload)
    payload["models"][0]["retires_at"] = None
    payload["models"][0]["request_defaults"] = {"temperature": 0.5, "top_p": 0.9}
    with pytest.raises(ValueError):
        InferenceCatalog.model_validate(payload)
