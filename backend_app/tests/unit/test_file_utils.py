"""
Unit tests for file_utils.py

Pure unit tests for file utility functions including:
- File extension extraction
- Audio duration extraction
- Temp file cleanup
- File validation
"""

import pytest
import os
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# TEST: get_extension
# ============================================================================

class TestGetExtension:
    """Tests for FileUtils.get_extension method."""
    
    def test_extracts_simple_extension(self):
        """Given filename with extension, when getting extension, then returns extension."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("recording.wav")
        
        assert result == "wav"
    
    def test_extracts_extension_case_insensitive(self):
        """Given filename with uppercase extension, when getting extension, then returns lowercase."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("recording.WAV")
        
        assert result == "wav"
    
    def test_handles_multiple_dots(self):
        """Given filename with multiple dots, when getting extension, then returns last part."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("my.recording.file.mp3")
        
        assert result == "mp3"
    
    def test_handles_no_extension(self):
        """Given filename without extension, when getting extension, then returns empty string."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("recording")
        
        assert result == ""
    
    def test_handles_empty_filename(self):
        """Given empty filename, when getting extension, then returns empty string."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("")
        
        assert result == ""
    
    def test_strips_leading_dot(self):
        """Given extension with leading dot, when getting extension, then strips dot."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_extension("file.mp3")
        
        assert result == "mp3"
        assert not result.startswith(".")


# ============================================================================
# TEST: validate_audio_file
# ============================================================================

class TestValidateAudioFile:
    """Tests for FileUtils.validate_audio_file method."""
    
    def test_validates_wav_file(self, tmp_path):
        """Given valid wav file, when validating, then returns True."""
        from app.utils.file_utils import FileUtils
        
        # Create temp wav file
        wav_file = tmp_path / "test.wav"
        wav_file.write_bytes(b"RIFF" + b"\x00" * 100)
        
        is_valid, message = FileUtils.validate_audio_file(str(wav_file))
        
        assert is_valid is True
        assert "valid" in message.lower()
    
    def test_validates_mp3_file(self, tmp_path):
        """Given valid mp3 file, when validating, then returns True."""
        from app.utils.file_utils import FileUtils
        
        mp3_file = tmp_path / "test.mp3"
        mp3_file.write_bytes(b"ID3" + b"\x00" * 100)
        
        is_valid, message = FileUtils.validate_audio_file(str(mp3_file))
        
        assert is_valid is True

    def test_rejects_renamed_text_file(self, tmp_path):
        """Given text content with an audio extension, when validating, then returns False."""
        from app.utils.file_utils import FileUtils

        fake_wav = tmp_path / "fake.wav"
        fake_wav.write_text("not audio")

        is_valid, message = FileUtils.validate_audio_file(str(fake_wav))

        assert is_valid is False
        assert "content" in message.lower()
    
    def test_rejects_unsupported_format(self, tmp_path):
        """Given unsupported file format, when validating, then returns False."""
        from app.utils.file_utils import FileUtils
        
        txt_file = tmp_path / "test.txt"
        txt_file.write_text("not an audio file")
        
        is_valid, message = FileUtils.validate_audio_file(str(txt_file))
        
        assert is_valid is False
        assert "unsupported" in message.lower()
    
    def test_rejects_nonexistent_file(self):
        """Given nonexistent file, when validating, then returns False."""
        from app.utils.file_utils import FileUtils
        
        is_valid, message = FileUtils.validate_audio_file("/nonexistent/file.wav")
        
        assert is_valid is False
        assert "not exist" in message.lower()
    
    def test_validates_m4a_file(self, tmp_path):
        """Given m4a file, when validating, then returns True."""
        from app.utils.file_utils import FileUtils
        
        m4a_file = tmp_path / "test.m4a"
        m4a_file.write_bytes(b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 92)
        
        is_valid, message = FileUtils.validate_audio_file(str(m4a_file))
        
        assert is_valid is True
    
    def test_validates_flac_file(self, tmp_path):
        """Given flac file, when validating, then returns True."""
        from app.utils.file_utils import FileUtils
        
        flac_file = tmp_path / "test.flac"
        flac_file.write_bytes(b"fLaC" + b"\x00" * 100)
        
        is_valid, message = FileUtils.validate_audio_file(str(flac_file))
        
        assert is_valid is True


# ============================================================================
# TEST: get_safe_temp_path
# ============================================================================

class TestGetSafeTempPath:
    """Tests for FileUtils.get_safe_temp_path method."""
    
    def test_creates_path_with_timestamp(self, tmp_path):
        """Given filename, when getting safe path, then includes timestamp."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_safe_temp_path("recording.wav", str(tmp_path))
        
        assert "recording" in result
        assert ".wav" in result
        assert str(tmp_path) in result
    
    def test_creates_directory_if_not_exists(self, tmp_path):
        """Given non-existent directory, when getting safe path, then creates directory."""
        from app.utils.file_utils import FileUtils
        
        new_dir = tmp_path / "new_temp_dir"
        
        result = FileUtils.get_safe_temp_path("file.mp3", str(new_dir))
        
        assert os.path.exists(new_dir)
        assert str(new_dir) in result
    
    def test_preserves_extension(self):
        """Given filename with extension, when getting safe path, then preserves extension."""
        from app.utils.file_utils import FileUtils
        
        with tempfile.TemporaryDirectory() as temp_dir:
            result = FileUtils.get_safe_temp_path("audio.m4a", temp_dir)
            
            assert result.endswith(".m4a")


# ============================================================================
# TEST: ensure_directory_exists
# ============================================================================

class TestEnsureDirectoryExists:
    """Tests for FileUtils.ensure_directory_exists method."""
    
    def test_creates_new_directory(self, tmp_path):
        """Given non-existent directory, when ensuring exists, then creates it."""
        from app.utils.file_utils import FileUtils
        
        new_dir = tmp_path / "new_directory"
        assert not new_dir.exists()
        
        FileUtils.ensure_directory_exists(str(new_dir))
        
        assert new_dir.exists()
    
    def test_does_not_fail_on_existing_directory(self, tmp_path):
        """Given existing directory, when ensuring exists, then no error."""
        from app.utils.file_utils import FileUtils
        
        existing_dir = tmp_path / "existing"
        existing_dir.mkdir()
        
        # Should not raise
        FileUtils.ensure_directory_exists(str(existing_dir))
        
        assert existing_dir.exists()


# ============================================================================
# TEST: clean_temp_files
# ============================================================================

class TestCleanTempFiles:
    """Tests for FileUtils.clean_temp_files method."""
    
    def test_removes_old_files(self, tmp_path):
        """Given old temp files, when cleaning, then removes them."""
        from app.utils.file_utils import FileUtils
        import time
        
        # Create a file
        old_file = tmp_path / "old_file.tmp"
        old_file.write_text("old content")
        
        # Set modification time to 25 hours ago
        old_time = datetime.now() - timedelta(hours=25)
        os.utime(str(old_file), (old_time.timestamp(), old_time.timestamp()))
        
        FileUtils.clean_temp_files(str(tmp_path), max_age_hours=24)
        
        assert not old_file.exists()
    
    def test_keeps_recent_files(self, tmp_path):
        """Given recent temp files, when cleaning, then keeps them."""
        from app.utils.file_utils import FileUtils
        
        # Create a recent file
        recent_file = tmp_path / "recent_file.tmp"
        recent_file.write_text("recent content")
        
        FileUtils.clean_temp_files(str(tmp_path), max_age_hours=24)
        
        assert recent_file.exists()
    
    def test_handles_nonexistent_directory(self):
        """Given non-existent directory, when cleaning, then no error."""
        from app.utils.file_utils import FileUtils
        
        # Should not raise
        FileUtils.clean_temp_files("/nonexistent/directory")


# ============================================================================
# TEST: get_audio_duration
# ============================================================================

class TestGetAudioDuration:
    """Tests for FileUtils.get_audio_duration method."""
    
    @patch("app.utils.file_utils.MUTAGEN_AVAILABLE", False)
    def test_returns_none_when_mutagen_unavailable(self):
        """Given mutagen not installed, when getting duration, then returns None."""
        from app.utils.file_utils import FileUtils
        
        # Need to reload or patch differently
        result = FileUtils.get_audio_duration("/some/file.wav")
        
        # When mutagen is not available, should return None
        assert result is None
    
    def test_returns_none_for_nonexistent_file(self):
        """Given nonexistent file, when getting duration, then returns None."""
        from app.utils.file_utils import FileUtils
        
        result = FileUtils.get_audio_duration("/nonexistent/file.wav")
        
        assert result is None
    
    @patch("app.utils.file_utils.MutagenFile")
    @patch("app.utils.file_utils.MUTAGEN_AVAILABLE", True)
    def test_extracts_duration_from_audio(self, mock_mutagen_file, tmp_path):
        """Given valid audio file, when getting duration, then returns seconds."""
        from app.utils.file_utils import FileUtils
        
        # Create mock file
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"test")
        
        # Mock mutagen response
        mock_audio = MagicMock()
        mock_audio.info.length = 120.5
        mock_mutagen_file.return_value = mock_audio
        
        result = FileUtils.get_audio_duration(str(audio_file))
        
        assert result == 120.5


# ============================================================================
# TEST: get_audio_duration_minutes
# ============================================================================

class TestGetAudioDurationMinutes:
    """Tests for FileUtils.get_audio_duration_minutes method."""
    
    @patch.object(__import__("app.utils.file_utils", fromlist=["FileUtils"]).FileUtils, "get_audio_duration")
    def test_converts_seconds_to_minutes(self, mock_get_duration):
        """Given duration in seconds, when getting minutes, then converts correctly."""
        from app.utils.file_utils import FileUtils
        
        mock_get_duration.return_value = 180.0  # 3 minutes
        
        result = FileUtils.get_audio_duration_minutes("/some/file.wav")
        
        assert result == 3.0
    
    @patch.object(__import__("app.utils.file_utils", fromlist=["FileUtils"]).FileUtils, "get_audio_duration")
    def test_returns_none_when_no_duration(self, mock_get_duration):
        """Given no duration available, when getting minutes, then returns None."""
        from app.utils.file_utils import FileUtils
        
        mock_get_duration.return_value = None
        
        result = FileUtils.get_audio_duration_minutes("/some/file.wav")
        
        assert result is None


# ============================================================================
# TEST: save_upload_to_temp & router handling
# ============================================================================

def test_save_upload_to_temp_rejects_big_file(tmp_path):
    from io import BytesIO
    from app.utils.file_utils import FileUtils

    class FakeUpload:
        def __init__(self, size):
            self.file = BytesIO(b"x" * size)

    small = FakeUpload(100)
    dest = tmp_path / "out.bin"
    # max_bytes small to trigger
    with pytest.raises(FileUtils.UploadTooLargeError):
        FileUtils.save_upload_to_temp(small, str(dest), max_bytes=10)


def test_job_upload_service_handles_large_upload(monkeypatch):
    # Ensure upload workflow surfaces 413 when saving raises UploadTooLargeError.
    from app.utils.file_utils import FileUtils
    from app.services.jobs.job_upload_service import JobUploadService
    from starlette.datastructures import UploadFile
    import asyncio
    from unittest.mock import AsyncMock
    from app.core.errors.domain import ApplicationError
    from io import BytesIO

    fake_upload = UploadFile(filename="big.wav", file=BytesIO(b"x"))

    # Patch save_upload_to_temp to raise
    orig = FileUtils.save_upload_to_temp
    def raise_too_large(upload_file, dest_path, max_bytes=1):
        raise FileUtils.UploadTooLargeError("too big")

    monkeypatch.setattr(FileUtils, "save_upload_to_temp", staticmethod(raise_too_large))

    try:
        mock_user = {"id": "user_1", "email": "a@a.com"}
        mock_job_svc = AsyncMock()
        mock_analytics = AsyncMock()
        mock_prompt_service = AsyncMock()
        upload_service = JobUploadService(mock_job_svc, mock_analytics, mock_prompt_service)

        with pytest.raises(ApplicationError) as exc:
            asyncio.get_event_loop().run_until_complete(
                upload_service.create_job_from_upload(
                    file=fake_upload,
                    current_user=mock_user,
                )
            )
        assert exc.value.status_code == 413
        mock_job_svc.upload_and_create_job.assert_not_called()
    finally:
        monkeypatch.setattr(FileUtils, "save_upload_to_temp", orig)
