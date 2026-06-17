"""
Pytest configuration and shared fixtures for backend_app tests.

This conftest.py provides:
- Custom pytest markers (unit, component, integration, requires_emulator, slow)
- The --run-emulators CLI option to opt-in to emulator-backed tests
- Shared fixtures for fakes, factories, and common test setup

Test Layer Overview:
- Unit tests: Pure functions, no I/O, fast (<1s per file)
- Component tests: Service classes with in-memory fakes, no external deps
- Integration tests: Full stack with emulators, opt-in via --run-emulators
"""

import asyncio
import os
import sys
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock, AsyncMock

import pytest
import pytest_asyncio

# Add backend_app to path for imports
backend_app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_app_root not in sys.path:
    sys.path.insert(0, backend_app_root)


# ============================================================================
# PYTEST CONFIGURATION
# ============================================================================

def pytest_addoption(parser):
    """Add custom CLI options for pytest."""
    parser.addoption(
        "--run-emulators",
        action="store_true",
        default=False,
        help="Run tests that require emulators (Azurite, Cosmos Emulator)",
    )


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests (fast, no I/O)"
    )
    config.addinivalue_line(
        "markers", "component: marks tests as component tests (use in-memory fakes)"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (require emulators)"
    )
    config.addinivalue_line(
        "markers", "requires_emulator: marks tests that require running emulators"
    )
    config.addinivalue_line(
        "markers", "slow: marks tests as slow-running"
    )


def pytest_collection_modifyitems(config, items):
    """
    Modify test collection based on markers and CLI options.
    
    - Skip requires_emulator tests unless --run-emulators is provided
    - Auto-skip integration tests without --run-emulators
    """
    run_emulators = config.getoption("--run-emulators")
    
    skip_emulator = pytest.mark.skip(
        reason="Requires emulators. Use --run-emulators to run."
    )
    
    for item in items:
        # Skip emulator-dependent tests
        if "requires_emulator" in item.keywords and not run_emulators:
            item.add_marker(skip_emulator)
        
        # Integration tests implicitly require emulators
        if "integration" in item.keywords and not run_emulators:
            item.add_marker(skip_emulator)


# ============================================================================
# EVENT LOOP CONFIGURATION
# ============================================================================

@pytest.fixture(scope="session")
def event_loop():
    """
    Create a session-scoped event loop for async tests.
    
    This ensures all async fixtures and tests share the same loop,
    which is important for proper cleanup and resource management.
    """
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# IN-MEMORY FAKE FIXTURES
# ============================================================================

@pytest_asyncio.fixture
async def cosmos_fake():
    """
    Provide an in-memory Cosmos DB fake for component tests.
    
    Usage:
        async def test_job_creation(cosmos_fake):
            job = await cosmos_fake.create_job(job_factory())
            assert job["id"] is not None
    """
    from tests.common.fakes import InMemoryCosmosFake
    
    fake = InMemoryCosmosFake()
    await fake.initialize()
    yield fake
    await fake.clear_all()
    await fake.close()


@pytest_asyncio.fixture
async def blob_fake():
    """
    Provide an in-memory Blob Storage fake for component tests.
    
    Usage:
        async def test_file_upload(blob_fake):
            url = await blob_fake.upload_file("/path", "file.wav")
            assert "blob.core.windows.net" in url
    """
    from tests.common.fakes import InMemoryBlobFake
    
    fake = InMemoryBlobFake()
    yield fake
    await fake.clear_all()
    await fake.close()


# ============================================================================
# FACTORY FIXTURES
# ============================================================================

@pytest.fixture
def user_factory_fixture():
    """Provide access to user_factory in tests."""
    from tests.common.factories import user_factory
    return user_factory


@pytest.fixture
def job_factory_fixture():
    """Provide access to job_factory in tests."""
    from tests.common.factories import job_factory
    return job_factory


@pytest.fixture
def prompt_factory_fixture():
    """Provide access to prompt_factory in tests."""
    from tests.common.factories import prompt_factory
    return prompt_factory


# ============================================================================
# SERVICE FIXTURES WITH FAKES
# ============================================================================

@pytest_asyncio.fixture
async def job_service_with_fakes(cosmos_fake, blob_fake):
    """
    Provide a JobService instance wired to in-memory fakes.
    
    Usage:
        async def test_job_lifecycle(job_service_with_fakes):
            cosmos, blob, service = job_service_with_fakes
            job = await service.get_job("job-1")
    """
    from app.repositories.jobs import JobRepository
    from app.services.jobs.job_service import JobService
    
    service = JobService(blob_fake, JobRepository(cosmos_fake))
    yield cosmos_fake, blob_fake, service
    service.close()


# ============================================================================
# TEST USER FIXTURES
# ============================================================================

@pytest.fixture
def test_user():
    """Provide a basic test user document."""
    from tests.common.factories import user_factory
    return user_factory(
        id="test-user-1",
        email="testuser@example.com",
        name="Test User",
        permission="user",
    )


@pytest.fixture
def admin_user():
    """Provide an admin user document."""
    from tests.common.factories import user_factory
    return user_factory(
        id="admin-user-1",
        email="admin@example.com",
        name="Admin User",
        permission="admin",
    )


@pytest.fixture
def superuser():
    """Provide a superuser document."""
    from tests.common.factories import user_factory
    return user_factory(
        id="super-user-1",
        email="superuser@example.com",
        name="Super User",
        permission="superuser",
    )


# ============================================================================
# TEST JOB FIXTURES
# ============================================================================

@pytest.fixture
def test_job(test_user):
    """Provide a basic test job document."""
    from tests.common.factories import job_factory
    return job_factory(
        id="test-job-1",
        user_id=test_user["id"],
        user_email=test_user["email"],
        file_name="test_recording.wav",
        status="uploaded",
    )


@pytest.fixture
def completed_job(test_user):
    """Provide a completed job with transcription and analysis."""
    from tests.common.factories import completed_job_factory
    return completed_job_factory(
        id="completed-job-1",
        user_id=test_user["id"],
    )


# ============================================================================
# MOCK CONFIG FIXTURE
# ============================================================================

@pytest.fixture
def mock_config():
    """
    Provide a mock AppConfig for unit tests.
    
    This avoids loading environment variables and provides
    predictable, test-friendly configuration values.
    """
    config = MagicMock()
    config.environment = "test"
    config.debug = True
    config.app_name = "Community Brief Test"
    config.app_version = "1.0.0-test"
    
    # Cosmos settings
    config.cosmos_endpoint = "https://localhost:8081"
    config.cosmos_key = "test-key"
    config.cosmos_database = "TestDB"
    config.cosmos_prefix = "test_"
    config.cosmos_containers = {
        "auth": "test_auth",
        "jobs": "test_jobs",
        "prompts": "test_prompts",
        "analytics": "test_analytics",
        "user_sessions": "test_user_sessions",
        "audit_logs": "test_audit_logs",
    }
    
    # Storage settings
    config.azure_storage_account_url = "https://fakeaccount.blob.core.windows.net"
    config.azure_storage_key = "test-storage-key"
    config.azure_storage_recordings_container = "uploads"
    
    # Auth settings
    config.jwt_secret_key = "test-secret-key-for-testing-only"
    config.jwt_algorithm = "HS256"
    config.jwt_access_token_expire_minutes = 60
    config.jwt_refresh_token_expire_days = 7
    
    # Azure OpenAI settings
    config.azure_openai_endpoint = "https://test-openai.openai.azure.com"
    config.azure_openai_key = "test-openai-key"
    config.azure_openai_deployment = "gpt-4"
    
    # Azure Functions settings
    config.azure_functions_base_url = "http://localhost:7071"
    config.azure_functions_key = "test-functions-key"
    
    # CORS settings
    config.cors_origins = "http://localhost:3000"
    config.cors_origins_list = ["http://localhost:3000"]
    config.cors_allow_credentials = True
    
    # Cache settings
    config.cache_type = "memory"
    config.redis_url = None
    config.cache_key_prefix = "test:"
    config.cache_ttl = 300
    
    return config


# ============================================================================
# ASYNC HELPERS
# ============================================================================

@pytest.fixture
def async_mock():
    """
    Factory fixture for creating AsyncMock objects.
    
    Usage:
        def test_async_call(async_mock):
            mock_fn = async_mock(return_value={"data": "test"})
            result = await mock_fn()
            assert result["data"] == "test"
    """
    def _create_async_mock(**kwargs):
        return AsyncMock(**kwargs)
    return _create_async_mock


# ============================================================================
# CLEANUP HELPERS
# ============================================================================

@pytest_asyncio.fixture(autouse=True)
async def cleanup_caches():
    """
    Automatically clear caches between tests to ensure isolation.
    
    This runs after each test to prevent cache pollution.
    """
    yield
    
    # Clear job cache if it exists
    try:
        from app.services.jobs.job_service import _job_cache
        await _job_cache.clear()
    except (ImportError, AttributeError):
        pass
    
    # Permission cache cleanup no longer required (cache is created per-config)


# ============================================================================
# ENVIRONMENT VARIABLE HELPERS
# ============================================================================

@pytest.fixture
def env_vars(monkeypatch):
    """
    Fixture for setting environment variables in tests.
    
    Usage:
        def test_with_env(env_vars):
            env_vars(AZURE_COSMOS_ENDPOINT="https://test.documents.azure.com")
            # Test code that reads from environment
    """
    def _set_env_vars(**kwargs):
        for key, value in kwargs.items():
            monkeypatch.setenv(key, value)
    return _set_env_vars


@pytest.fixture(autouse=True)
def default_test_env(monkeypatch):
    """
    Ensure basic AppConfig-required environment variables exist for unit tests.

    This prevents pydantic AppConfig initialization from failing when individual
    tests don't explicitly provide a mocked or configured AppConfig.
    """
    # Minimal values required by AppConfig
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fakeaccount.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    # Optional values to avoid noisy log messages
    monkeypatch.setenv("AZURE_STORAGE_KEY", "test-storage-key")
    monkeypatch.setenv("AZURE_OPENAI_KEY", "test-openai-key")
    yield


# ============================================================================
# LOGGING HELPERS
# ============================================================================

@pytest.fixture
def capture_logs(caplog):
    """
    Fixture for capturing and asserting on log messages.
    
    Usage:
        def test_logs_error(capture_logs):
            # Code that logs an error
            assert "error message" in capture_logs.text
    """
    import logging
    caplog.set_level(logging.DEBUG)
    return caplog
