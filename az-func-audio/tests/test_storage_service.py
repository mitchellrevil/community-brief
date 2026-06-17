"""
Unit tests for StorageService.

Tests file upload, text upload, PDF generation, DOCX generation, and error handling.
"""

import pytest
from unittest.mock import Mock, patch, mock_open
import tempfile
import os
from datetime import datetime

from services.storage_service import StorageService, StorageServiceError


@pytest.mark.unit
class TestStorageServiceUploadFile:
    """Test file upload operations."""

    def test_upload_file_success(self, storage_service, tmp_path):
        """Should upload file successfully and return blob URL."""
        # Setup
        test_file = tmp_path / "test.wav"
        test_file.write_text("test content")
        original_filename = "test.wav"

        # Mock the blob client
        mock_blob_client = storage_service.blob_service_client.get_container_client.return_value.get_blob_client.return_value
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/test.wav"

        # Execute
        result = storage_service.upload_file(str(test_file), original_filename)

        # Verify
        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called_once()
        # Verify the file was opened for reading
        with patch("builtins.open", mock_open(read_data=b"test content")) as mock_file:
            storage_service.upload_file(str(test_file), original_filename)
            mock_file.assert_called_once_with(str(test_file), "rb")

    def test_upload_file_azure_error(self, storage_service, tmp_path):
        """Should raise StorageServiceError on Azure error."""
        from azure.core.exceptions import AzureError

        test_file = tmp_path / "test.wav"
        test_file.write_text("test content")

        # Mock Azure error
        storage_service.blob_service_client.get_container_client.side_effect = AzureError("Azure error")

        # Execute & Verify
        with pytest.raises(StorageServiceError, match="Azure storage error"):
            storage_service.upload_file(str(test_file), "test.wav")

    def test_upload_file_general_error(self, storage_service, tmp_path):
        """Should raise StorageServiceError on general error."""
        test_file = tmp_path / "test.wav"
        test_file.write_text("test content")

        # Mock general error
        storage_service.blob_service_client.get_container_client.side_effect = RuntimeError("General error")

        # Execute & Verify
        with pytest.raises(StorageServiceError, match="Error uploading file"):
            storage_service.upload_file(str(test_file), "test.wav")


@pytest.mark.unit
class TestStorageServiceUploadText:
    """Test text upload operations."""

    def test_upload_text_success(self, storage_service):
        """Should upload text successfully and return blob URL."""
        # Setup
        container_name = "test-container"
        blob_name = "test.txt"
        text_content = "Hello, world!"

        mock_blob_client = storage_service.blob_service_client.get_container_client.return_value.get_blob_client.return_value
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/test-container/test.txt"

        # Execute
        result = storage_service.upload_text(container_name, blob_name, text_content)

        # Verify
        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called_once_with(text_content.encode("utf-8"), overwrite=True)

    def test_upload_text_error(self, storage_service):
        """Should raise StorageServiceError on upload error."""
        storage_service.blob_service_client.get_container_client.side_effect = RuntimeError("Upload error")

        # Execute & Verify
        with pytest.raises(StorageServiceError, match="Error uploading text"):
            storage_service.upload_text("container", "blob", "content")


@pytest.mark.unit
class TestStorageServiceGenerateAndUploadPdf:
    """Test PDF generation and upload operations."""

    def test_generate_and_upload_pdf_success(self, storage_service):
        """Should generate PDF and upload successfully."""
        # Setup
        analysis_text = "Test analysis\nSecond line"
        blob_url = "test.pdf"

        mock_blob_client = storage_service.blob_service_client.get_container_client.return_value.get_blob_client.return_value
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/test.pdf"

        # Execute
        result = storage_service.generate_and_upload_pdf(analysis_text, blob_url)

        # Verify
        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called_once()

    def test_generate_and_upload_pdf_error(self, storage_service):
        """Should raise StorageServiceError on PDF generation/upload error."""
        storage_service.blob_service_client.get_container_client.side_effect = RuntimeError("PDF error")

        # Execute & Verify
        with pytest.raises(StorageServiceError, match="Error generating/uploading PDF"):
            storage_service.generate_and_upload_pdf("analysis", "blob.pdf")


@pytest.mark.unit
class TestStorageServiceGenerateAndUploadDocx:
    """Test DOCX generation and upload operations."""

    def test_generate_and_upload_docx_success(self, storage_service):
        """Should generate DOCX and upload successfully."""
        # Setup
        analysis_text = "# Title\n\nThis is content.\n\n- Bullet point"
        blob_url = "test.docx"

        mock_blob_client = storage_service.blob_service_client.get_container_client.return_value.get_blob_client.return_value
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/test.docx"

        # Execute
        result = storage_service.generate_and_upload_docx(analysis_text, blob_url)

        # Verify
        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called_once()

    def test_generate_and_upload_docx_error(self, storage_service):
        """Should raise StorageServiceError on DOCX generation/upload error."""
        storage_service.blob_service_client.get_container_client.side_effect = RuntimeError("DOCX error")

        # Execute & Verify
        with pytest.raises(StorageServiceError, match="Error generating/uploading DOCX"):
            storage_service.generate_and_upload_docx("analysis", "blob.docx")

    def test_generate_and_upload_docx_fallback_when_markdown_missing(self, storage_service):
        """If markdown-it-py is not installed, DOCX generation should still succeed via fallback."""
        analysis_text = "Title\n\nSome content here.\n\n- item"
        blob_url = "fallback.docx"

        mock_blob_client = storage_service.blob_service_client.get_container_client.return_value.get_blob_client.return_value
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/recordings/fallback.docx"

        # Simulate missing markdown_it module
        with patch.dict('sys.modules', {'markdown_it': None}):
            result = storage_service.generate_and_upload_docx(analysis_text, blob_url)

        assert result == mock_blob_client.url
        mock_blob_client.upload_blob.assert_called()

@pytest.mark.unit
class TestStorageServiceInitialization:
    """Test StorageService initialization."""

    def test_init_with_provided_credential(self, app_config):
        """Should initialize with provided credential."""
        mock_credential = Mock()
        mock_blob_client = Mock()

        service = StorageService(
            config=app_config,
            credential=mock_credential,
            blob_service_client=mock_blob_client
        )

        assert service.credential == mock_credential
        assert service.blob_service_client == mock_blob_client

    @patch("azure.identity.DefaultAzureCredential")
    def test_init_without_credential(self, mock_cred_class, app_config):
        """Should initialize with DefaultAzureCredential when none provided."""
        mock_cred_instance = Mock()
        mock_cred_class.return_value = mock_cred_instance

        service = StorageService(config=app_config)

        assert service.credential == mock_cred_instance
        mock_cred_class.assert_called_once()

    @patch("azure.identity.DefaultAzureCredential", side_effect=ImportError("Import error"))
    def test_init_credential_import_failure(self, mock_cred_class, app_config):
        """Should set credential to None if import fails."""
        service = StorageService(config=app_config)

        assert service.credential is None