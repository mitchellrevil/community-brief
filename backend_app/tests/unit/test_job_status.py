"""
Tests for job status validation and constants.

Ensures the backend rejects non-canonical statuses and that status sets
match expectations for SSE streaming.
"""
import pytest
from pydantic import ValidationError

from app.models.job import Job
from app.models.job_status import (
    VALID_STATUSES,
    TERMINAL_STATUSES,
    IN_PROGRESS_STATUSES,
    is_valid_status,
    is_terminal_status,
    is_in_progress_status,
)


class TestJobStatusConstants:
    """Test job status constant definitions."""
    
    def test_valid_statuses_matches_backend_expectations(self):
        """Verify VALID_STATUSES contains all canonical backend statuses."""
        expected_statuses = {
            "uploaded",
            "transcribing",
            "transcribed",
            "analysing",
            "completed",
            "failed",
            "error",
        }
        
        assert VALID_STATUSES == expected_statuses, (
            f"Job status constants mismatch.\n"
            f"Expected: {expected_statuses}\n"
            f"Actual: {VALID_STATUSES}\n"
            f"Missing: {expected_statuses - VALID_STATUSES}\n"
            f"Extra: {VALID_STATUSES - expected_statuses}"
        )
    
    def test_terminal_statuses_matches_sse_expectations(self):
        """Verify terminal statuses match SSE streaming expectations."""
        expected_terminal = {"completed", "failed", "error"}
        
        assert TERMINAL_STATUSES == expected_terminal, (
            f"Terminal statuses mismatch.\n"
            f"Expected: {expected_terminal}\n"
            f"Actual: {TERMINAL_STATUSES}"
        )
    
    def test_in_progress_statuses(self):
        """Verify in-progress statuses are correct."""
        expected_in_progress = {"transcribing", "transcribed", "analysing"}
        
        assert IN_PROGRESS_STATUSES == expected_in_progress


class TestJobStatusHelperFunctions:
    """Test job status helper functions."""
    
    def test_is_valid_status_returns_true_for_canonical(self):
        """Canonical statuses should be recognized as valid."""
        for status in VALID_STATUSES:
            assert is_valid_status(status) is True, f"{status} should be valid"
    
    def test_is_valid_status_returns_false_for_invalid(self):
        """Non-canonical statuses should be rejected."""
        assert is_valid_status("text_processed") is False
        assert is_valid_status("document_processed") is False
        assert is_valid_status("invalid") is False
    
    def test_is_terminal_status_returns_true_for_terminal(self):
        """Terminal statuses should be recognized."""
        assert is_terminal_status("completed") is True
        assert is_terminal_status("failed") is True
        assert is_terminal_status("error") is True
    
    def test_is_terminal_status_returns_false_for_in_progress(self):
        """In-progress statuses should not be terminal."""
        assert is_terminal_status("transcribing") is False
        assert is_terminal_status("transcribed") is False
        assert is_terminal_status("analysing") is False
    
    def test_is_in_progress_status_returns_true_for_active(self):
        """Active processing statuses should be recognized."""
        assert is_in_progress_status("transcribing") is True
        assert is_in_progress_status("transcribed") is True
        assert is_in_progress_status("analysing") is True
    
    def test_is_in_progress_status_returns_false_for_terminal(self):
        """Terminal statuses should not be in-progress."""
        assert is_in_progress_status("completed") is False
        assert is_in_progress_status("failed") is False


class TestJobModelStatusValidation:
    """Test Job model status validation."""
    
    def test_job_model_accepts_canonical_statuses(self):
        """Job model should accept all canonical statuses."""
        base_job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.mp3",
            "file_path": "https://storage/test.mp3",
        }
        
        for status in VALID_STATUSES:
            job_data = {**base_job_data, "status": status}
            job = Job(**job_data)
            assert job.status == status
    
    def test_job_model_rejects_text_processed_status(self):
        """Job model should reject legacy 'text_processed' status."""
        job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.txt",
            "file_path": "https://storage/test.txt",
            "status": "text_processed",
        }
        
        with pytest.raises(ValidationError) as exc_info:
            Job(**job_data)
        
        assert "Invalid job status" in str(exc_info.value)
        assert "text_processed" in str(exc_info.value)
    
    def test_job_model_rejects_document_processed_status(self):
        """Job model should reject legacy 'document_processed' status."""
        job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.docx",
            "file_path": "https://storage/test.docx",
            "status": "document_processed",
        }
        
        with pytest.raises(ValidationError) as exc_info:
            Job(**job_data)
        
        assert "Invalid job status" in str(exc_info.value)
        assert "document_processed" in str(exc_info.value)
    
    def test_job_model_rejects_arbitrary_status(self):
        """Job model should reject any non-canonical status."""
        job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.mp3",
            "file_path": "https://storage/test.mp3",
            "status": "custom_status",
        }
        
        with pytest.raises(ValidationError) as exc_info:
            Job(**job_data)
        
        assert "Invalid job status" in str(exc_info.value)
    
    def test_job_is_terminal_method_uses_canonical_set(self):
        """Job.is_terminal() should use canonical terminal statuses."""
        job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.mp3",
            "file_path": "https://storage/test.mp3",
        }
        
        # Terminal statuses
        for status in TERMINAL_STATUSES:
            job = Job(**{**job_data, "status": status})
            assert job.is_terminal() is True, f"{status} should be terminal"
        
        # Non-terminal statuses
        non_terminal = VALID_STATUSES - TERMINAL_STATUSES
        for status in non_terminal:
            job = Job(**{**job_data, "status": status})
            assert job.is_terminal() is False, f"{status} should not be terminal"
    
    def test_job_is_processing_method_uses_canonical_set(self):
        """Job.is_processing() should use canonical in-progress statuses."""
        job_data = {
            "id": "test-job-123",
            "user_id": "user-456",
            "displayname": "Test Job",
            "file_name": "test.mp3",
            "file_path": "https://storage/test.mp3",
        }
        
        # In-progress statuses
        for status in IN_PROGRESS_STATUSES:
            job = Job(**{**job_data, "status": status})
            assert job.is_processing() is True, f"{status} should be in-progress"
        
        # Not in-progress statuses
        not_in_progress = VALID_STATUSES - IN_PROGRESS_STATUSES
        for status in not_in_progress:
            job = Job(**{**job_data, "status": status})
            assert job.is_processing() is False, f"{status} should not be in-progress"
