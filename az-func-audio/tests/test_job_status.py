"""
Tests for JobStatus canonical status constants.

Ensures the status values defined in az-func-audio match those expected
by the backend API and SSE streaming endpoints.
"""
import pytest
from core.job_status import JobStatus


class TestJobStatusConstants:
    """Test JobStatus constant definitions."""
    
    def test_job_status_defines_backend_statuses(self):
        """Verify JobStatus includes all canonical backend statuses."""
        expected_statuses = {
            "uploaded",
            "transcribing",
            "transcribed",
            "analysing",
            "completed",
            "failed",
            "error",
        }
        
        actual_statuses = JobStatus.all_statuses()
        
        assert actual_statuses == expected_statuses, (
            f"JobStatus mismatches backend expectations.\n"
            f"Expected: {expected_statuses}\n"
            f"Actual: {actual_statuses}\n"
            f"Missing: {expected_statuses - actual_statuses}\n"
            f"Extra: {actual_statuses - expected_statuses}"
        )
    
    def test_job_status_terminal_states_matches_backend(self):
        """Verify terminal states match backend/SSE expectations."""
        expected_terminal = {"completed", "failed", "error"}
        
        actual_terminal = JobStatus.terminal_states()
        
        assert actual_terminal == expected_terminal, (
            f"Terminal states mismatch.\n"
            f"Expected: {expected_terminal}\n"
            f"Actual: {actual_terminal}"
        )
    
    def test_job_status_in_progress_states(self):
        """Verify in-progress states are correct."""
        expected_in_progress = {"transcribing", "transcribed", "analysing"}
        
        actual_in_progress = JobStatus.in_progress_states()
        
        assert actual_in_progress == expected_in_progress


class TestJobStatusHelperMethods:
    """Test JobStatus helper methods."""
    
    def test_is_terminal_returns_true_for_completed(self):
        """Completed should be recognized as terminal."""
        assert JobStatus.is_terminal("completed") is True
    
    def test_is_terminal_returns_true_for_failed(self):
        """Failed should be recognized as terminal."""
        assert JobStatus.is_terminal("failed") is True
    
    def test_is_terminal_returns_true_for_error(self):
        """Error should be recognized as terminal."""
        assert JobStatus.is_terminal("error") is True
    
    def test_is_terminal_returns_false_for_in_progress(self):
        """In-progress statuses should not be terminal."""
        assert JobStatus.is_terminal("transcribing") is False
        assert JobStatus.is_terminal("transcribed") is False
        assert JobStatus.is_terminal("analysing") is False
    
    def test_is_in_progress_returns_true_for_active_states(self):
        """Active processing states should be recognized."""
        assert JobStatus.is_in_progress("transcribing") is True
        assert JobStatus.is_in_progress("transcribed") is True
        assert JobStatus.is_in_progress("analysing") is True
    
    def test_is_in_progress_returns_false_for_terminal(self):
        """Terminal states should not be in-progress."""
        assert JobStatus.is_in_progress("completed") is False
        assert JobStatus.is_in_progress("failed") is False
    
    def test_is_in_progress_returns_false_for_uploaded(self):
        """Uploaded should not be considered in-progress."""
        assert JobStatus.is_in_progress("uploaded") is False


class TestJobStatusConstantValues:
    """Test individual constant values match expected strings."""
    
    def test_uploaded_constant(self):
        """UPLOADED constant has correct value."""
        assert JobStatus.UPLOADED == "uploaded"
    
    def test_transcribing_constant(self):
        """TRANSCRIBING constant has correct value."""
        assert JobStatus.TRANSCRIBING == "transcribing"
    
    def test_transcribed_constant(self):
        """TRANSCRIBED constant has correct value."""
        assert JobStatus.TRANSCRIBED == "transcribed"
    
    def test_analysing_constant(self):
        """ANALYSING constant has correct value."""
        assert JobStatus.ANALYSING == "analysing"
    
    def test_completed_constant(self):
        """COMPLETED constant has correct value."""
        assert JobStatus.COMPLETED == "completed"
    
    def test_failed_constant(self):
        """FAILED constant has correct value."""
        assert JobStatus.FAILED == "failed"
    
    def test_error_constant(self):
        """ERROR constant has correct value."""
        assert JobStatus.ERROR == "error"
