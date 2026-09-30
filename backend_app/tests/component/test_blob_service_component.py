"""
Component and Unit tests for StorageService (blob_service.py)

Tests for Azure Blob Storage operations including:
- SAS token generation
- File upload
- Blob download (text and docx)
- Stream blob content
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta, timezone
from azure.core.exceptions import ResourceNotFoundError
from app.services.storage.blob_service import _sas_url_cache


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_config():
    """Create a mock AppConfig for storage service."""
    config = MagicMock()
    config.azure_storage_account_url = "https://teststorage.blob.core.windows.net"
    config.azure_storage_key = "test-storage-key"
    config.azure_storage_recordings_container = "recordings"
    return config


@pytest.fixture
def storage_service(mock_config):
    """Create a StorageService with mocked dependencies."""
    with patch("app.services.storage.blob_service.BlobServiceClient") as MockBlobServiceClient:
        from app.services.storage.blob_service import StorageService
        
        mock_blob_client = AsyncMock()
        # Ensure synchronous methods are mocked as MagicMock, not AsyncMock
        mock_blob_client.get_container_client = MagicMock()
        mock_blob_client.get_blob_client = MagicMock()
        
        MockBlobServiceClient.return_value = mock_blob_client
        
        service = StorageService(mock_config)
        service.blob_service_client = mock_blob_client
        
        yield service


@pytest_asyncio.fixture(autouse=True)
async def clear_sas_url_cache():
    await _sas_url_cache.clear()
    yield
    await _sas_url_cache.clear()


# ============================================================================
# TEST: __init__
# ============================================================================

class TestStorageServiceInit:
    """Tests for StorageService initialization."""
    
    def test_uses_key_authentication_when_key_provided(self, mock_config):
        """Given storage key, when initializing, then uses key-based auth."""
        with patch("app.services.storage.blob_service.BlobServiceClient") as MockClient:
            from app.services.storage.blob_service import StorageService
            
            mock_config.azure_storage_key = "my-storage-key"
            
            service = StorageService(mock_config)
            
            assert service.credential == "my-storage-key"
    
    def test_uses_managed_identity_when_no_key(self, mock_config):
        """Given no storage key, when initializing, then uses DefaultAzureCredential."""
        with patch("app.services.storage.blob_service.BlobServiceClient"):
            with patch("app.services.storage.blob_service.DefaultAzureCredential") as MockCredential:
                from app.services.storage.blob_service import StorageService
                
                mock_config.azure_storage_key = None
                MockCredential.return_value = MagicMock()
                
                service = StorageService(mock_config)
                
                MockCredential.assert_called_once()
                assert service.credential is not None


# ============================================================================
# TEST: generate_sas_token
# ============================================================================

class TestGenerateSasToken:
    """Tests for SAS token generation."""
    
    @pytest.mark.asyncio
    async def test_generates_sas_token_for_valid_url(self, storage_service):
        """Given valid blob URL, when generating SAS, then returns token."""
        with patch("app.services.storage.blob_service.generate_blob_sas") as mock_generate:
            mock_generate.return_value = "sv=2021-06-08&st=2024-01-01&se=2024-01-02&sig=token"
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/test.wav"
            
            result = await storage_service.generate_sas_token(blob_url)
            
            assert result is not None
            assert "sv=" in result
            mock_generate.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_url(self, storage_service):
        """Given empty URL, when generating SAS, then returns None."""
        result = await storage_service.generate_sas_token("")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_none_url(self, storage_service):
        """Given None URL, when generating SAS, then returns None."""
        result = await storage_service.generate_sas_token(None)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_invalid_url_format(self, storage_service):
        """Given invalid URL format, when generating SAS, then returns None."""
        blob_url = "https://teststorage.blob.core.windows.net/recordings"  # Missing blob name
        
        result = await storage_service.generate_sas_token(blob_url)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_handles_nested_blob_paths(self, storage_service):
        """Given nested blob path, when generating SAS, then handles correctly."""
        with patch("app.services.storage.blob_service.generate_blob_sas") as mock_generate:
            mock_generate.return_value = "sig=token"
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/folder/subfolder/test.wav"
            
            result = await storage_service.generate_sas_token(blob_url)
            
            assert result is not None
            call_kwargs = mock_generate.call_args[1]
            assert "folder/subfolder/test.wav" in call_kwargs["blob_name"]


# ============================================================================
# TEST: add_sas_token_to_url
# ============================================================================

class TestAddSasTokenToUrl:
    """Tests for adding SAS token to blob URL."""
    
    @pytest.mark.asyncio
    async def test_adds_sas_token_to_url(self, storage_service):
        """Given URL without token, when adding SAS, then appends token."""
        with patch.object(storage_service, "generate_sas_token") as mock_gen:
            mock_gen.return_value = "sv=2021-06-08&sig=token"
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/test.wav"
            
            result = await storage_service.add_sas_token_to_url(blob_url)
            
            assert "?" in result
            assert "sig=token" in result
    
    @pytest.mark.asyncio
    async def test_skips_url_with_existing_query_params(self, storage_service):
        """Given URL with query params, when adding SAS, then returns unchanged."""
        blob_url = "https://teststorage.blob.core.windows.net/recordings/test.wav?existing=param"
        
        result = await storage_service.add_sas_token_to_url(blob_url)
        
        assert result == blob_url
    
    @pytest.mark.asyncio
    async def test_returns_empty_url_unchanged(self, storage_service):
        """Given empty URL, when adding SAS, then returns empty."""
        result = await storage_service.add_sas_token_to_url("")
        
        assert result == ""
    
    @pytest.mark.asyncio
    async def test_returns_original_url_if_token_generation_fails(self, storage_service):
        """Given token generation failure, when adding SAS, then returns original URL."""
        with patch.object(storage_service, "generate_sas_token") as mock_gen:
            mock_gen.return_value = None
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/test.wav"
            
            result = await storage_service.add_sas_token_to_url(blob_url)
            
            assert result == blob_url


# ============================================================================
# TEST: upload_file
# ============================================================================

class TestUploadFile:
    """Tests for file upload to blob storage."""
    
    @pytest.mark.asyncio
    async def test_uploads_file_successfully(self, storage_service, tmp_path):
        """Given valid file, when uploading, then returns blob URL."""
        # Create temp file
        test_file = tmp_path / "test_recording.wav"
        test_file.write_bytes(b"audio content")
        
        # Mock blob client
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/test_recording.wav"
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client.return_value = mock_container
        
        result = await storage_service.upload_file(str(test_file), "test_recording.wav")
        
        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_sanitizes_filename_spaces(self, storage_service, tmp_path):
        """Given filename with spaces, when uploading, then replaces with underscores."""
        test_file = tmp_path / "test.wav"
        test_file.write_bytes(b"audio")
        
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/test.wav"
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client.return_value = mock_container
        
        await storage_service.upload_file(str(test_file), "my test file.wav")
        
        call_args = mock_container.get_blob_client.call_args
        blob_name = call_args[1]["blob"] if "blob" in call_args[1] else call_args[0][0]
        assert " " not in blob_name
        assert "my_test_file" in blob_name
    
    @pytest.mark.asyncio
    async def test_includes_date_in_blob_path(self, storage_service, tmp_path):
        """Given upload request, when uploading, then includes date in path."""
        test_file = tmp_path / "test.wav"
        test_file.write_bytes(b"audio")
        
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/test.wav"
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client.return_value = mock_container
        
        await storage_service.upload_file(str(test_file), "test.wav")
        
        call_args = mock_container.get_blob_client.call_args
        blob_name = call_args[1]["blob"] if "blob" in call_args[1] else call_args[0][0]
        
        # Should contain date format YYYY-MM-DD
        current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assert current_date in blob_name


# ============================================================================
# TEST: download_text_from_blob
# ============================================================================

class TestDownloadTextFromBlob:
    """Tests for downloading text content from blob."""
    
    @pytest.mark.asyncio
    async def test_downloads_text_successfully(self, storage_service):
        """Given valid blob URL, when downloading, then returns text content."""
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_stream = AsyncMock()
        mock_stream.readall.return_value = b"This is the text content"
        mock_blob_client.download_blob.return_value = mock_stream
        
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client = MagicMock(return_value=mock_container)
        
        blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/file.txt"
        
        result = await storage_service.download_text_from_blob(blob_url)
        
        assert result == "This is the text content"
    
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_url(self, storage_service):
        """Given empty URL, when downloading, then returns None."""
        result = await storage_service.download_text_from_blob("")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_none_url(self, storage_service):
        """Given None URL, when downloading, then returns None."""
        result = await storage_service.download_text_from_blob(None)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_invalid_url(self, storage_service):
        """Given invalid URL format, when downloading, then returns None."""
        blob_url = "https://teststorage.blob.core.windows.net/recordings"  # No blob name
        
        result = await storage_service.download_text_from_blob(blob_url)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_handles_download_error(self, storage_service):
        """Given download error, when downloading, then returns None."""
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_blob_client.download_blob.side_effect = RuntimeError("Network error")
        
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client = MagicMock(return_value=mock_container)
        
        blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/file.txt"
        
        result = await storage_service.download_text_from_blob(blob_url)
        
        assert result is None


# ============================================================================
# TEST: download_docx_text_from_blob
# ============================================================================

class TestDownloadDocxTextFromBlob:
    """Tests for downloading and extracting text from docx blobs."""
    
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_url(self, storage_service):
        """Given empty URL, when downloading docx, then returns None."""
        result = await storage_service.download_docx_text_from_blob("")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_invalid_url(self, storage_service):
        """Given invalid URL format, when downloading docx, then returns None."""
        blob_url = "https://teststorage.blob.core.windows.net/recordings"
        
        result = await storage_service.download_docx_text_from_blob(blob_url)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_handles_missing_python_docx(self, storage_service):
        """Given python-docx not installed, when downloading docx, then returns None."""
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_stream = AsyncMock()
        mock_stream.readall.return_value = b"fake docx content"
        mock_blob_client.download_blob.return_value = mock_stream
        
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client = MagicMock(return_value=mock_container)
        
        with patch("asyncio.to_thread") as mock_thread:
            mock_thread.side_effect = ImportError("No module named 'docx'")
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/file.docx"
            
            # Should not raise, just return None
            result = await storage_service.download_docx_text_from_blob(blob_url)
            
            assert result is None


# ============================================================================
# TEST: generate_and_upload_docx
# ============================================================================

class TestGenerateAndUploadDocx:
    """Tests for DOCX generation and upload."""
    
    @pytest.mark.asyncio
    async def test_generates_and_uploads_docx(self, storage_service):
        """Given analysis text, when generating docx, then uploads to blob."""
        mock_container = MagicMock()
        mock_blob_client = AsyncMock()
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/analysis.docx"
        mock_container.get_blob_client.return_value = mock_blob_client
        storage_service.blob_service_client.get_container_client.return_value = mock_container
        
        with patch("asyncio.to_thread") as mock_thread:
            mock_thread.return_value = b"docx content bytes"
            
            result = await storage_service.generate_and_upload_docx(
                "This is the analysis text",
                "2024-01-01/analysis.docx"
            )
            
            assert result == mock_blob_client.url
            mock_blob_client.upload_blob.assert_called_once()


# ============================================================================
# TEST: stream_blob_content
# ============================================================================

class TestStreamBlobContent:
    """Tests for streaming blob content."""
    
    @pytest.mark.asyncio
    async def test_raises_for_empty_url(self, storage_service):
        """Given empty URL, when streaming, then raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            async for _ in storage_service.stream_blob_content(""):
                pass
    
    @pytest.mark.asyncio
    async def test_raises_for_invalid_url_path(self, storage_service):
        """Given URL without path, when streaming, then raises ValueError."""
        with pytest.raises(ValueError, match="Invalid"):
            async for _ in storage_service.stream_blob_content("https://teststorage.blob.core.windows.net"):
                pass
    
    @pytest.mark.asyncio
    async def test_streams_blob_chunks(self, storage_service):
        """Given valid blob URL, when streaming, then yields chunks."""
        with patch("app.services.storage.blob_service.BlobClient") as MockBlobClient:
            # Create mock async context manager
            mock_blob_client = AsyncMock()
            mock_downloader = AsyncMock()
            
            # Mock async generator for chunks
            async def mock_chunks():
                yield b"chunk1"
                yield b"chunk2"
                yield b"chunk3"
            
            # chunks() should return the async generator, not be a coroutine itself
            mock_downloader.chunks = MagicMock(return_value=mock_chunks())
            mock_blob_client.download_blob.return_value = mock_downloader
            mock_blob_client.__aenter__.return_value = mock_blob_client
            mock_blob_client.__aexit__.return_value = None
            MockBlobClient.return_value = mock_blob_client
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/test.wav"
            
            chunks = []
            async for chunk in storage_service.stream_blob_content(blob_url):
                chunks.append(chunk)
            
            assert len(chunks) == 3
            assert chunks == [b"chunk1", b"chunk2", b"chunk3"]
    
    @pytest.mark.asyncio
    async def test_handles_resource_not_found(self, storage_service):
        """Given blob not found, when streaming, then raises ResourceNotFoundError."""
        with patch("app.services.storage.blob_service.BlobClient") as MockBlobClient:
            mock_blob_client = AsyncMock()
            mock_blob_client.__aenter__.side_effect = ResourceNotFoundError("Blob not found")
            MockBlobClient.return_value = mock_blob_client
            
            blob_url = "https://teststorage.blob.core.windows.net/recordings/2024-01-01/nonexistent.wav"
            
            with pytest.raises(ResourceNotFoundError):
                async for _ in storage_service.stream_blob_content(blob_url):
                    pass


# ============================================================================
# TEST: close
# ============================================================================

class TestClose:
    """Tests for closing storage service connections."""
    
    @pytest.mark.asyncio
    async def test_closes_blob_service_client(self, storage_service):
        """Given open service, when closing, then closes blob client."""
        await storage_service.close()
        
        storage_service.blob_service_client.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_closes_credential_if_managed_identity(self, mock_config):
        """Given managed identity credential, when closing, then closes credential."""
        with patch("app.services.storage.blob_service.BlobServiceClient"):
            with patch("app.services.storage.blob_service.DefaultAzureCredential") as MockCredential:
                from app.services.storage.blob_service import StorageService
                
                mock_config.azure_storage_key = None
                mock_credential = AsyncMock()
                MockCredential.return_value = mock_credential
                
                service = StorageService(mock_config)
                service.blob_service_client = AsyncMock()
                
                await service.close()
                
                mock_credential.close.assert_called_once()


# ============================================================================
# TEST: User Delegation Key Caching
# ============================================================================

class TestUserDelegationKeyCaching:
    """Tests for user delegation key caching mechanism."""
    
    @pytest.mark.asyncio
    async def test_caches_user_delegation_key(self, mock_config):
        """Given managed identity, when generating multiple SAS tokens, then caches key."""
        with patch("app.services.storage.blob_service.BlobServiceClient") as MockBlobClient:
            with patch("app.services.storage.blob_service.DefaultAzureCredential") as MockCredential:
                from app.services.storage.blob_service import StorageService
                
                mock_config.azure_storage_key = None
                mock_credential = MagicMock()  # Not string, so managed identity
                MockCredential.return_value = mock_credential
                
                mock_blob_client = AsyncMock()
                mock_delegation_key = MagicMock()
                mock_blob_client.get_user_delegation_key.return_value = mock_delegation_key
                MockBlobClient.return_value = mock_blob_client
                
                service = StorageService(mock_config)
                
                # First call should fetch key
                with patch("app.services.storage.blob_service.generate_blob_sas") as mock_gen:
                    mock_gen.return_value = "token1"
                    
                    await service.generate_sas_token(
                        "https://teststorage.blob.core.windows.net/recordings/test.wav"
                    )
                    
                    # Second call should use cached key
                    mock_gen.return_value = "token2"
                    await service.generate_sas_token(
                        "https://teststorage.blob.core.windows.net/recordings/test2.wav"
                    )
                    
                    # get_user_delegation_key should only be called once due to caching
                    assert mock_blob_client.get_user_delegation_key.call_count == 1
