"""
Shared test fixtures and configuration for az-func-audio tests.

This module provides common test fixtures, mock objects, and test data
to be used across all test modules.
"""

import pytest
import sys
import os
import os
import tempfile
from unittest.mock import Mock, AsyncMock, MagicMock
from typing import Dict, Any, Optional
from datetime import UTC, datetime
import uuid

# Ensure the az-func-audio package root is on sys.path so imports like
# `from config import AppConfig` succeed when pytest runs from the repo root.
pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if pkg_root not in sys.path:
    sys.path.insert(0, pkg_root)

# Import services and config
from config import AppConfig
from services.storage_service import StorageService
from services.analysis_service import AnalysisService
from services.cosmos_service import CosmosService
from services.file_processing_service import FileProcessingService


# ============================================================================
# Configuration Fixtures
# ============================================================================

@pytest.fixture
def mock_env_vars(monkeypatch):
    """Set up mock environment variables for testing."""
    env_vars = {
        "AZURE_COSMOS_ENDPOINT": "https://test-cosmos.documents.azure.com:443/",
        "AZURE_COSMOS_DATABASE": "test-database",
        "AZURE_COSMOS_JOBS_CONTAINER": "test-jobs",
        "AZURE_COSMOS_PROMPTS_CONTAINER": "test-prompts",
        "AZURE_STORAGE_ACCOUNT_URL": "https://teststorage.blob.core.windows.net",
        "AZURE_STORAGE_RECORDINGS_CONTAINER": "recordings",
        "AZURE_STORAGE_TRANSCRIPTIONS_CONTAINER": "transcriptions",
        "AZURE_STORAGE_ANALYSES_CONTAINER": "analyses",
        "AZURE_STORAGE_DOCUMENTS_CONTAINER": "documents",
        "AZURE_SPEECH_ENDPOINT": "https://test-region.api.cognitive.microsoft.com",
        "AZURE_SPEECH_REGION": "eastus",
        "AZURE_SPEECH_CANDIDATE_LOCALES": "en-GB",
        "AZURE_OPENAI_ENDPOINT": "https://test-openai.openai.azure.com",
        "AZURE_OPENAI_DEPLOYMENT": "gpt-4",
        "AZURE_OPENAI_API_VERSION": "2024-02-01",
        "AZURE_OPENAI_API_KEY": "test-api-key",
    }
    
    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)
    
    return env_vars


@pytest.fixture
def app_config(mock_env_vars):
    """Provide a test AppConfig instance."""
    return AppConfig()


@pytest.fixture
def mock_credential():
    """Provide a mock Azure credential."""
    credential = Mock()
    credential.get_token = Mock(return_value=Mock(token="mock_token_12345"))
    return credential


# ============================================================================
# Azure Service Mock Fixtures
# ============================================================================

@pytest.fixture
def mock_blob_service_client():
    """Provide a mock BlobServiceClient."""
    client = Mock()
    
    # Mock container client
    container_client = Mock()
    blob_client = Mock()
    blob_client.url = "https://teststorage.blob.core.windows.net/container/test.txt"
    blob_client.upload_blob = Mock()
    blob_client.download_blob = Mock(return_value=Mock(readall=Mock(return_value=b"test content")))
    
    container_client.get_blob_client = Mock(return_value=blob_client)
    client.get_container_client = Mock(return_value=container_client)
    
    return client


@pytest.fixture
def mock_cosmos_client():
    """Provide a mock CosmosClient."""
    client = Mock()
    database = Mock()
    container = Mock()
    
    # Mock container operations
    container.read_item = Mock()
    container.upsert_item = Mock()
    container.query_items = Mock(return_value=[])
    container.delete_item = Mock()
    
    database.get_container_client = Mock(return_value=container)
    client.get_database_client = Mock(return_value=database)
    
    return client


# ============================================================================
# Service Fixtures
# ============================================================================

@pytest.fixture
def storage_service(app_config, mock_credential, mock_blob_service_client):
    """Provide a StorageService with mocked dependencies."""
    return StorageService(
        config=app_config,
        credential=mock_credential,
        blob_service_client=mock_blob_service_client
    )


@pytest.fixture
def cosmos_service(app_config, mock_credential, mock_cosmos_client):
    """Provide a CosmosService with mocked dependencies."""
    return CosmosService(
        config=app_config,
        credential=mock_credential,
        cosmos_client=mock_cosmos_client
    )


@pytest.fixture
def analysis_service(app_config, mock_credential):
    """Provide an AnalysisService with mocked dependencies."""
    return AnalysisService(
        config=app_config,
        credential=mock_credential
    )


@pytest.fixture
def file_processing_service(app_config, storage_service, mock_credential):
    """Provide a FileProcessingService with mocked dependencies."""
    return FileProcessingService(
        config=app_config,
        storage_service=storage_service,
        credential=mock_credential
    )


# ============================================================================
# Test Data Fixtures
# ============================================================================

@pytest.fixture
def sample_job_data() -> Dict[str, Any]:
    """Provide sample job data for testing."""
    job_id = str(uuid.uuid4())
    return {
        "id": job_id,
        "file_path": "https://teststorage.blob.core.windows.net/recordings/test.mp3",
        "status": "pending",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "original_filename": "test.mp3",
        "file_type": "audio/mpeg",
        "transcription_job_id": None,
        "transcription_text": None,
        "analysis_text": None,
        "talking_points": [],
    }


@pytest.fixture
def sample_transcription_response() -> Dict[str, Any]:
    """Provide sample transcription API response."""
    return {
        "self": "https://test-region.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/12345",
        "model": {"self": "https://..."},
        "links": {
            "files": "https://test-region.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/12345/files"
        },
        "properties": {
            "durationInTicks": 18000000,
            "succeededProcessingCount": 1,
            "failedProcessingCount": 0
        },
        "lastActionDateTime": "2025-10-16T10:00:00Z",
        "status": "Succeeded",
        "createdDateTime": "2025-10-16T09:55:00Z",
        "locale": "en-US",
        "displayName": "test-transcription"
    }


@pytest.fixture
def sample_transcription_files_response() -> Dict[str, Any]:
    """Provide sample transcription files API response."""
    return {
        "values": [
            {
                "kind": "Transcription",
                "name": "transcription.json",
                "links": {
                    "contentUrl": "https://test-storage.blob.core.windows.net/transcription.json?sas=mock"
                }
            }
        ]
    }


@pytest.fixture
def sample_transcription_content() -> Dict[str, Any]:
    """Provide sample transcription content."""
    return {
        "source": "https://teststorage.blob.core.windows.net/recordings/test.mp3",
        "timestamp": "2025-10-16T10:00:00Z",
        "durationInTicks": 18000000,
        "duration": "PT1.8S",
        "combinedRecognizedPhrases": [
            {
                "channel": 0,
                "lexical": "hello this is a test audio file",
                "itn": "hello this is a test audio file",
                "maskedITN": "hello this is a test audio file",
                "display": "Hello, this is a test audio file."
            }
        ],
        "recognizedPhrases": [
            {
                "recognitionStatus": "Success",
                "channel": 0,
                "offset": "PT0S",
                "duration": "PT1.8S",
                "offsetInTicks": 0,
                "durationInTicks": 18000000,
                "nBest": [
                    {
                        "confidence": 0.95,
                        "lexical": "hello this is a test audio file",
                        "itn": "hello this is a test audio file",
                        "maskedITN": "hello this is a test audio file",
                        "display": "Hello, this is a test audio file.",
                        "words": [
                            {"word": "hello", "offset": "PT0S", "duration": "PT0.3S"},
                            {"word": "this", "offset": "PT0.3S", "duration": "PT0.2S"},
                        ]
                    }
                ]
            }
        ]
    }


@pytest.fixture
def sample_audio_file(tmp_path):
    """Create a temporary audio file for testing."""
    audio_file = tmp_path / "test_audio.mp3"
    audio_file.write_bytes(b"fake mp3 content " * 100)  # Create a small fake file
    return str(audio_file)


@pytest.fixture
def sample_text_file(tmp_path):
    """Create a temporary text file for testing."""
    text_file = tmp_path / "test_document.txt"
    text_file.write_text("This is a test document with sample content.")
    return str(text_file)


@pytest.fixture
def sample_analysis_response() -> str:
    """Provide sample analysis response from OpenAI."""
    return """# Analysis Summary

This is a test analysis of the content provided.

## Key Points
- Point 1: Important finding
- Point 2: Secondary observation
- Point 3: Conclusion

## Details
The content discusses several important topics that require attention.

## Recommendations
1. Action item one
2. Action item two
"""


@pytest.fixture
def sample_talking_points() -> list[str]:
    """Provide sample talking points."""
    return [
        "First key point about the content",
        "Second important observation",
        "Third critical insight",
        "Fourth supporting detail",
        "Fifth concluding remark"
    ]


# ============================================================================
# HTTP Request Mock Fixtures
# ============================================================================

@pytest.fixture
def mock_http_request():
    """Provide a mock Azure Functions HttpRequest."""
    def _create_request(method="POST", body=None, params=None, headers=None):
        request = Mock()
        request.method = method
        request.params = params or {}
        request.headers = headers or {}
        
        if body:
            request.get_json = Mock(return_value=body)
            request.get_body = Mock(return_value=json.dumps(body).encode('utf-8'))
        else:
            request.get_json = Mock(return_value={})
            request.get_body = Mock(return_value=b'{}')
        
        return request
    
    return _create_request


@pytest.fixture
def mock_blob_trigger_input():
    """Provide a mock Azure Functions blob trigger InputStream."""
    def _create_blob_input(name="test.mp3", uri=None, length=1024):
        blob_input = Mock()
        blob_input.name = name
        blob_input.uri = uri or f"https://teststorage.blob.core.windows.net/recordings/{name}"
        blob_input.length = length
        blob_input.read = Mock(return_value=b"fake audio content " * 50)
        return blob_input
    
    return _create_blob_input


# ============================================================================
# Async Mock Helpers
# ============================================================================

@pytest.fixture
def mock_aiohttp_session():
    """Provide a mock aiohttp session for async HTTP calls."""
    session = AsyncMock()
    response = AsyncMock()
    response.status = 200
    response.json = AsyncMock(return_value={"status": "success"})
    response.text = AsyncMock(return_value="success")
    response.__aenter__ = AsyncMock(return_value=response)
    response.__aexit__ = AsyncMock(return_value=None)
    
    session.get = Mock(return_value=response)
    session.post = Mock(return_value=response)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    
    return session


# ============================================================================
# Pytest Configuration
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "requires_azure: mark test as requiring Azure services"
    )
