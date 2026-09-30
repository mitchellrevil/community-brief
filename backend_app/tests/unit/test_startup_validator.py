import pytest
import asyncio
from backend_app.app.core.health.startup_validator import StartupValidator, StartupValidationError
from backend_app.app.core.config import AppConfig


class DummyCosmos:
    def __init__(self, ping_result=True, ping_raises=False):
        self._ping_result = ping_result
        self._ping_raises = ping_raises

    async def ping(self, timeout_seconds=5):
        if self._ping_raises:
            raise RuntimeError("ping error")
        await asyncio.sleep(0)
        return self._ping_result

    # Minimal database property and container accessor for container validation checks
    @property
    def database(self):
        return self

    def get_container(self, name: str):
        class DummyContainer:
            async def read(self):
                return {"id": name}
        return DummyContainer()


@pytest.mark.asyncio
async def test_validate_all_passes_when_cosmos_ping_ok():
    from types import SimpleNamespace
    cfg = SimpleNamespace(
        cosmos_endpoint="https://example",
        cosmos_database="db",
        cosmos_key="fakekey",
        jwt_secret_key="secret",
        azure_storage_account_url="https://storage.example",
        azure_storage_recordings_container="recordings",
    )

    dummy = DummyCosmos(ping_result=True)
    validator = StartupValidator(dummy, cfg)

    # Avoid external blob validation in unit test environment
    async def _noop_blob():
        return None
    validator._validate_blob_storage = _noop_blob

    result = await validator.validate_all(fail_fast=True)

    assert result.is_healthy is True
    assert result.validations_passed >= 1


@pytest.mark.asyncio
async def test_validate_all_raises_when_cosmos_ping_fails():
    from types import SimpleNamespace
    cfg = SimpleNamespace(
        cosmos_endpoint="https://example",
        cosmos_database="db",
        cosmos_key="fakekey",
        jwt_secret_key="secret",
        azure_storage_account_url="https://storage.example",
        azure_storage_recordings_container="recordings",
    )

    dummy = DummyCosmos(ping_result=False)
    validator = StartupValidator(dummy, cfg)

    # Avoid external blob validation in unit test environment
    async def _noop_blob():
        return None
    validator._validate_blob_storage = _noop_blob

    with pytest.raises(StartupValidationError):
        await validator.validate_all(fail_fast=True)


@pytest.mark.asyncio
async def test_cosmos_ping_propagates_exceptions_as_failure():
    from types import SimpleNamespace
    cfg = SimpleNamespace(
        cosmos_endpoint="https://example",
        cosmos_database="db",
        cosmos_key="fakekey",
        jwt_secret_key="secret",
        azure_storage_account_url="https://storage.example",
        azure_storage_recordings_container="recordings",
    )

    dummy = DummyCosmos(ping_result=True, ping_raises=True)
    validator = StartupValidator(dummy, cfg)

    # Avoid external blob validation in unit test environment
    async def _noop_blob():
        return None
    validator._validate_blob_storage = _noop_blob

    with pytest.raises(StartupValidationError):
        await validator.validate_all(fail_fast=True)
