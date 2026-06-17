"""
Integration tests for the full stack with emulators.

These tests require running emulators (Azurite, Cosmos DB Emulator).
Run with: pytest --run-emulators -m integration

Prerequisites:
    1. Start emulators: cd backend_app/tests/common && ./run_emulators.ps1
    2. Wait for health checks to pass
    3. Run: pytest --run-emulators -m integration
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

# Mark all tests in this module as integration tests requiring emulators
pytestmark = [pytest.mark.integration, pytest.mark.requires_emulator]


# ============================================================================
# FIXTURES
# ============================================================================

@pytest_asyncio.fixture(scope="module")
async def app_client(emulators_ready):
    """
    Provide an async test client for the FastAPI application.
    
    This fixture creates the full application with emulator connections.
    """
    # Import here to avoid loading app config before env vars are set
    from app.main import app
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


# ============================================================================
# TEST: Health Check
# ============================================================================

class TestHealthEndpoint:
    """Tests for the health check endpoint."""
    
    @pytest.mark.asyncio
    async def test_health_endpoint_returns_ok(self, app_client):
        """Given the app is running, when calling /health/live, then returns 200."""
        response = await app_client.get("/health/live")
        
        assert response.status_code == 200


# ============================================================================
# TEST: User Authentication Flow
# ============================================================================

class TestAuthenticationFlow:
    """Integration tests for user authentication."""
    
    @pytest.mark.asyncio
    async def test_login_with_valid_credentials(self, app_client, seeded_cosmos_data):
        """Given a valid user exists, when logging in, then returns token."""
        # This test would need actual auth implementation
        # Placeholder for the pattern
        pass
    
    @pytest.mark.asyncio
    async def test_protected_endpoint_requires_auth(self, app_client):
        """Given no auth token, when accessing protected endpoint, then returns 401."""
        response = await app_client.get("/api/v1/jobs")
        
        # Should require authentication
        assert response.status_code in (401, 403)


# ============================================================================
# TEST: Job Workflow
# ============================================================================

class TestJobWorkflow:
    """Integration tests for the job lifecycle."""
    
    @pytest.mark.asyncio
    async def test_create_job_stores_in_cosmos(
        self, 
        app_client, 
        cosmos_emulator_client,
        seeded_cosmos_data,
    ):
        """Given authenticated user, when creating job, then job is stored in Cosmos."""
        # This would test the full flow:
        # 1. Authenticate user
        # 2. Upload file
        # 3. Create job
        # 4. Verify job in Cosmos
        pass
    
    @pytest.mark.asyncio
    async def test_get_job_returns_enriched_data(
        self,
        app_client,
        seeded_cosmos_data,
    ):
        """Given a job exists, when getting it, then returns enriched data with SAS URLs."""
        # This would test:
        # 1. Get job by ID
        # 2. Verify file URLs have SAS tokens
        # 3. Verify all expected fields are present
        pass


# ============================================================================
# TEST: Storage Integration
# ============================================================================

class TestStorageIntegration:
    """Integration tests for Azure Blob Storage operations."""
    
    @pytest.mark.asyncio
    async def test_upload_file_to_azurite(self, blob_emulator_client):
        """Given Azurite is running, when uploading file, then file is stored."""
        from tests.common.emulators import EmulatorConfig
        
        container_name = f"{EmulatorConfig.RUN_PREFIX}uploads"
        
        # Create container if not exists
        try:
            await blob_emulator_client.create_container(container_name)
        except Exception:
            pass  # Container may already exist
        
        container = blob_emulator_client.get_container_client(container_name)
        blob = container.get_blob_client("test-file.txt")
        
        await blob.upload_blob(b"Test content", overwrite=True)
        
        # Verify upload
        download = await blob.download_blob()
        content = await download.readall()
        
        assert content == b"Test content"
    
    @pytest.mark.asyncio
    async def test_generate_sas_token_for_blob(self, blob_emulator_client):
        """Given a blob exists, when generating SAS, then URL is accessible."""
        # This would test SAS token generation against Azurite
        pass


# ============================================================================
# TEST: Database Integration
# ============================================================================

class TestDatabaseIntegration:
    """Integration tests for Cosmos DB operations."""
    
    @pytest.mark.asyncio
    async def test_create_and_read_user_in_cosmos(self, cosmos_emulator_client):
        """Given Cosmos emulator is running, when creating user, then user is persisted."""
        from tests.common.factories import user_factory
        from tests.common.emulators import EmulatorConfig
        
        container = cosmos_emulator_client.get_container_client(
            f"{EmulatorConfig.RUN_PREFIX}auth"
        )
        
        user = user_factory(id="cosmos-test-user", email="cosmos@test.com")
        
        # Create user
        await container.create_item(user)
        
        # Read back
        retrieved = await container.read_item(
            item=user["id"],
            partition_key=user["id"]
        )
        
        assert retrieved["id"] == "cosmos-test-user"
        assert retrieved["email"] == "cosmos@test.com"
    
    @pytest.mark.asyncio
    async def test_query_users_by_type(self, cosmos_emulator_client, seeded_cosmos_data):
        """Given users exist in Cosmos, when querying by type, then returns users."""
        from tests.common.emulators import EmulatorConfig
        
        container = cosmos_emulator_client.get_container_client(
            f"{EmulatorConfig.RUN_PREFIX}auth"
        )
        
        query = "SELECT * FROM c WHERE c.type = @type"
        parameters = [{"name": "@type", "value": "user"}]
        
        users = []
        async for item in container.query_items(query=query, parameters=parameters):
            users.append(item)
        
        assert len(users) >= 2  # Seeded data includes at least 2 users


# ============================================================================
# TEST: End-to-End Workflows
# ============================================================================

class TestEndToEndWorkflows:
    """End-to-end integration tests for complete user workflows."""
    
    @pytest.mark.asyncio
    async def test_full_job_lifecycle(
        self,
        app_client,
        cosmos_emulator_client,
        blob_emulator_client,
    ):
        """
        Test the complete job lifecycle:
        1. User authenticates
        2. User uploads audio file
        3. Job is created
        4. Transcription is processed (mocked)
        5. Analysis is generated (mocked)
        6. User retrieves completed job
        """
        # This would be a comprehensive integration test
        # covering the main user journey
        pass
    
    @pytest.mark.asyncio
    async def test_job_sharing_workflow(
        self,
        app_client,
        cosmos_emulator_client,
        seeded_cosmos_data,
    ):
        """
        Test job sharing between users:
        1. Owner creates job
        2. Owner shares job with another user
        3. Shared user can access job
        4. Shared user cannot delete job
        """
        pass
