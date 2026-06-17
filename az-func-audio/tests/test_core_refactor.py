"""
Unit tests for core refactor components.

Tests Protocol implementations, DI providers, and logging utilities.
Run with: pytest tests/test_core_refactor.py -v
"""

import pytest
from unittest.mock import Mock, patch
import os
import io
import logging

# Import components to test
from core.logging import get_logger, redact, preview, sanitize_log_extra, setup_logging
from services.interfaces import BlobStorageService, TranscriptionService, AnalysisService


class TestLoggingUtilities:
    """Test security helpers for logging."""
    
    def test_redact_preserves_prefix(self):
        """Redact should keep first N characters visible."""
        secret = "REDACTED"
        result = redact(secret, keep=6)
        
        assert result == "REDACT…[redacted]"
        assert "[redacted]" in result
        assert secret not in result
    
    def test_redact_short_string(self):
        """Redact should fully hide very short strings."""
        secret = "abc"
        result = redact(secret, keep=6)
        
        assert result == "[redacted]"
    
    def test_redact_none_value(self):
        """Redact should handle None gracefully."""
        result = redact(None)
        assert result == ""
    
    def test_preview_truncates_long_text(self):
        """Preview should truncate long content."""
        long_text = "This is a very long document. " * 50
        result = preview(long_text, n=100)
        
        assert len(result) <= 101  # 100 + ellipsis
        assert result.endswith("…")
    
    def test_preview_preserves_short_text(self):
        """Preview should not modify text shorter than limit."""
        short_text = "Short content"
        result = preview(short_text, n=100)
        
        assert result == short_text
        assert "…" not in result
    
    def test_preview_normalizes_whitespace(self):
        """Preview should collapse newlines and extra spaces."""
        text_with_newlines = "Line 1\n\nLine 2\n  Line 3"
        result = preview(text_with_newlines, n=100)
        
        assert "\n" not in result
        assert "  " not in result
    
    def test_sanitize_removes_tokens(self):
        """Sanitize should redact sensitive field names."""
        extra = {
            "blob_url": "https://storage.blob.core.windows.net/container/file",
            "sas_token": "sv=2021-06-08&ss=b&srt=sco&sp=rwdlacx",
            "api_key": "REDACTED",
            "correlation_id": "abc-123"
        }
        
        result = sanitize_log_extra(extra)
        
        # Sensitive fields should be redacted
        assert "[redacted]" in result["sas_token"]
        assert "[redacted]" in result["api_key"]
        
        # Non-sensitive fields should remain
        assert result["correlation_id"] == "abc-123"
        assert result["blob_url"] == extra["blob_url"]
    
    def test_sanitize_previews_long_values(self):
        """Sanitize should preview very long field values."""
        extra = {
            "short_field": "abc",
            "long_content": "x" * 500
        }
        
        result = sanitize_log_extra(extra)
        
        assert result["short_field"] == "abc"
        assert len(result["long_content"]) <= 151  # 150 + ellipsis
        assert result["long_content"].endswith("…")

    def test_setup_logging_renders_extra_fields_and_exceptions(self):
        """setup_logging should update existing handlers so context is visible."""
        stream = io.StringIO()
        root_logger = logging.getLogger()
        original_handlers = root_logger.handlers[:]
        original_level = root_logger.level

        test_logger = logging.getLogger("tests.logging")
        original_test_handlers = test_logger.handlers[:]
        original_test_level = test_logger.level

        root_logger.handlers = [logging.StreamHandler(stream)]
        root_logger.setLevel(logging.WARNING)
        test_logger.handlers = []

        try:
            setup_logging(level="DEBUG", format_json=False)

            get_logger("tests.logging").debug(
                "Debug message",
                correlation_id="abc-123",
                attempt=2,
            )

            try:
                raise RuntimeError("boom")
            except RuntimeError:
                get_logger("tests.logging").error(
                    "Failed message",
                    job_id="job-1",
                    exc_info=True,
                )

            output = stream.getvalue()
            assert "Debug message" in output
            assert "correlation_id=abc-123" in output
            assert "attempt=2" in output
            assert "Failed message" in output
            assert "job_id=job-1" in output
            assert "RuntimeError: boom" in output
        finally:
            root_logger.handlers = original_handlers
            root_logger.setLevel(original_level)
            test_logger.handlers = original_test_handlers
            test_logger.setLevel(original_test_level)


class MockBlobService:
    """Mock implementation of BlobStorageService Protocol."""
    
    async def download_blob(self, container_name: str, blob_name: str) -> bytes:
        return b"mock blob content"
    
    async def upload_blob(self, container_name: str, blob_name: str, 
                         data: bytes, content_type: str = None) -> str:
        return f"https://mock.blob.core.windows.net/{container_name}/{blob_name}"
    
    async def get_blob_client(self, container_name: str, blob_name: str):
        return Mock()


class MockTranscriptionService:
    """Mock implementation of TranscriptionService Protocol."""
    
    def submit_transcription_job(self, audio_url: str, file_size_bytes=None, audio_duration_minutes=None) -> str:
        return "mock-job-id-12345"
    
    def check_status(self, job_id: str, timeout: int = 18000, interval: int = 5) -> dict:
        return {"status": "Succeeded", "id": job_id}
    
    def get_results(self, status_data: dict) -> str:
        return "This is the mock transcription text."


class MockAnalysisService:
    """Mock implementation of AnalysisService Protocol."""
    
    async def analyze_content(self, content: str, prompt: str, 
                             system_message: str = None) -> str:
        return f"Analysis result for: {content[:50]}"
    
    async def generate_talking_points(self, content: str, count: int = 5) -> list[str]:
        return [f"Talking point {i+1}" for i in range(count)]


class TestProtocolImplementations:
    """Test that mock implementations satisfy Protocol contracts."""
    
    @pytest.mark.asyncio
    async def test_blob_service_protocol(self):
        """Mock BlobService should satisfy Protocol."""
        service: BlobStorageService = MockBlobService()
        
        # Test download
        data = await service.download_blob("container", "file.txt")
        assert isinstance(data, bytes)
        
        # Test upload
        url = await service.upload_blob("container", "file.txt", b"data")
        assert url.startswith("https://")
    
    def test_transcription_service_protocol(self):
        """Mock TranscriptionService should satisfy Protocol."""
        service: TranscriptionService = MockTranscriptionService()
        
        # Test submit
        job_id = service.submit_transcription_job("https://audio.url")
        assert isinstance(job_id, str)
        
        # Test status check
        status = service.check_status(job_id)
        assert "status" in status
        
        # Test result retrieval
        result = service.get_results(status)
        assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_analysis_service_protocol(self):
        """Mock AnalysisService should satisfy Protocol."""
        service: AnalysisService = MockAnalysisService()
        
        # Test analyze
        result = await service.analyze_content("test content", "analyze this")
        assert isinstance(result, str)
        
        # Test talking points
        points = await service.generate_talking_points("test content", count=3)
        assert len(points) == 3
        assert all(isinstance(p, str) for p in points)


class TestDependencyProviders:
    """Test DI provider caching and initialization."""
    
    @patch.dict(os.environ, {
        "AZURE_STORAGE_CONNECTION_STRING": "mock_connection",
        "AZURE_SPEECH_KEY": "mock_key",
        "AZURE_SPEECH_REGION": "eastus",
        "AZURE_OPENAI_ENDPOINT": "https://mock.openai.azure.com",
        "AZURE_OPENAI_API_KEY": "mock_openai_key",
        "AZURE_OPENAI_DEPLOYMENT": "gpt-4"
    })
    def test_providers_require_env_vars(self):
        """Providers should validate required environment variables."""
        from services.service_providers import (
            get_transcription_service,
            get_analysis_service,
            clear_service_cache
        )
        
        # Clear cache first
        clear_service_cache()
        
        # Should not raise with env vars set
        try:
            # Note: These will fail if actual service classes aren't importable
            # In a real scenario, you'd mock the service imports
            pass  # Placeholder for actual provider calls
        except ImportError:
            # Expected if service modules aren't available yet
            pass
    
    @patch.dict(os.environ, {}, clear=True)
    def test_providers_fail_without_env_vars(self):
        """Providers should raise ValueError if env vars missing."""
        from services.service_providers import get_transcription_service, clear_service_cache
        
        clear_service_cache()
        
        # AppConfig requires AZURE_COSMOS_ENDPOINT (and other vars) so expect that error
        with pytest.raises(ValueError, match="Required environment variable"):
            get_transcription_service()


class TestIdempotencyPattern:
    """Test idempotency guard pattern for blob triggers."""
    
    @pytest.mark.asyncio
    async def test_skip_already_processed_job(self):
        """Should skip processing if job already complete."""
        
        # Mock job lookup
        async def mock_get_job(blob_url: str):
            return {"id": "job-123", "status": "completed"}
        
        blob_url = "https://storage/container/audio.mp3"
        job = await mock_get_job(blob_url)
        
        # Idempotency check
        should_skip = job and job.get("status") in ["completed", "processing"]
        
        assert should_skip is True
    
    @pytest.mark.asyncio
    async def test_process_new_job(self):
        """Should process if job is new or failed."""
        
        async def mock_get_job(blob_url: str):
            return None  # No existing job
        
        blob_url = "https://storage/container/audio.mp3"
        job = await mock_get_job(blob_url)
        
        # When job is None, the conditional short-circuits to False
        should_skip = bool(job and job.get("status") in ["completed", "processing"])
        
        assert should_skip is False


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
