"""
Unit tests for FileSecurityService (file_security_service.py)

Tests for file security validation including:
- Filename sanitization
- File size validation
- Extension validation
- Dangerous content detection
- MIME type detection
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import UploadFile
import io

from app.core.errors.domain import ApplicationError


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_config():
    """Create mock config for file security."""
    config = MagicMock()
    config.max_upload_size_mb = 500
    config.allowed_file_types_list = [".wav", ".mp3", ".m4a", ".flac", ".ogg"]
    return config


@pytest.fixture
def file_security_service(mock_config):
    """Create a FileSecurityService with mocked config."""
    from app.services.storage.file_security_service import FileSecurityService
    return FileSecurityService(mock_config)


def create_mock_upload_file(filename: str, content: bytes, content_type: str = "audio/wav") -> UploadFile:
    """Helper to create mock UploadFile objects."""
    file = MagicMock(spec=UploadFile)
    file.filename = filename
    file.content_type = content_type
    file.file = io.BytesIO(content)

    async def mock_read(size: int = -1):
        return file.file.read(size)

    async def mock_seek(pos: int):
        file.file.seek(pos)

    file.read = mock_read
    file.seek = mock_seek
    
    return file


# ============================================================================
# TEST: __init__
# ============================================================================

class TestFileSecurityServiceInit:
    """Tests for FileSecurityService initialization."""
    
    def test_initializes_with_config_values(self, mock_config):
        """Given config, when initializing, then uses config values."""
        from app.services.storage.file_security_service import FileSecurityService
        
        service = FileSecurityService(mock_config)
        
        assert service.max_size_bytes == 500 * 1024 * 1024  # 500MB in bytes
        assert ".wav" in service.allowed_exts
        assert ".mp3" in service.allowed_exts
    
    def test_converts_allowed_extensions_to_set(self, mock_config):
        """Given extension list, when initializing, then converts to set."""
        from app.services.storage.file_security_service import FileSecurityService
        
        service = FileSecurityService(mock_config)
        
        assert isinstance(service.allowed_exts, set)


# ============================================================================
# TEST: _sanitize_filename
# ============================================================================

class TestSanitizeFilename:
    """Tests for filename sanitization."""
    
    def test_preserves_valid_filename(self, file_security_service):
        """Given valid filename, when sanitizing, then preserves it."""
        result = file_security_service._sanitize_filename("recording.wav")
        
        assert result == "recording.wav"
    
    def test_removes_path_traversal_forward_slash(self, file_security_service):
        """Given path traversal with forward slash, when sanitizing, then removes path."""
        result = file_security_service._sanitize_filename("../../etc/passwd")
        
        assert "/" not in result
        assert ".." not in result
    
    def test_removes_path_traversal_backslash(self, file_security_service):
        """Given path traversal with backslash, when sanitizing, then removes path."""
        result = file_security_service._sanitize_filename("..\\..\\windows\\system32\\file.exe")
        
        assert "\\" not in result
    
    def test_removes_special_characters(self, file_security_service):
        """Given filename with special chars, when sanitizing, then removes them."""
        result = file_security_service._sanitize_filename("my file (1).wav")
        
        # Only alphanumeric, underscore, dash, and dot allowed
        assert " " not in result
        assert "(" not in result
        assert ")" not in result
    
    def test_preserves_underscore_and_dash(self, file_security_service):
        """Given filename with underscore and dash, when sanitizing, then preserves them."""
        result = file_security_service._sanitize_filename("my_recording-2024.wav")
        
        assert result == "my_recording-2024.wav"
    
    def test_rejects_hidden_files(self, file_security_service):
        """Given hidden file (starts with dot), when sanitizing, then returns empty."""
        result = file_security_service._sanitize_filename(".hidden")
        
        assert result == ""
    
    def test_rejects_empty_filename(self, file_security_service):
        """Given empty filename, when sanitizing, then returns empty."""
        result = file_security_service._sanitize_filename("")
        
        assert result == ""
    
    def test_truncates_long_filename(self, file_security_service):
        """Given very long filename, when sanitizing, then truncates to 255 chars."""
        long_name = "a" * 300 + ".wav"
        
        result = file_security_service._sanitize_filename(long_name)
        
        assert len(result) <= 255
    
    def test_handles_unicode_characters(self, file_security_service):
        """Given unicode characters, when sanitizing, then removes them."""
        result = file_security_service._sanitize_filename("música.wav")
        
        # Non-ASCII characters should be removed
        assert "ú" not in result


# ============================================================================
# TEST: validate - Basic Validation
# ============================================================================

class TestValidateBasic:
    """Tests for basic file validation."""
    
    @pytest.mark.asyncio
    async def test_validates_valid_file(self, file_security_service):
        """Given valid audio file, when validating, then returns metadata."""
        file = create_mock_upload_file("recording.wav", b"RIFF" + b"\x00" * 100)
        
        result = await file_security_service.validate(file)
        
        assert "safe_filename" in result
        assert "file_hash" in result
        assert "size" in result
        assert result["safe_filename"] == "recording.wav"
    
    @pytest.mark.asyncio
    async def test_rejects_missing_file(self, file_security_service):
        """Given None file, when validating, then raises an application error."""
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(None)
        
        assert exc_info.value.status_code == 400
        assert "No file" in exc_info.value.message
    
    @pytest.mark.asyncio
    async def test_rejects_file_without_filename(self, file_security_service):
        """Given file without filename, when validating, then raises an application error."""
        file = MagicMock(spec=UploadFile)
        file.filename = None
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_rejects_invalid_filename(self, file_security_service):
        """Given file with invalid filename, when validating, then raises an application error."""
        file = create_mock_upload_file(".hidden", b"content")
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
        assert "Invalid filename" in exc_info.value.message


# ============================================================================
# TEST: validate - Size Validation
# ============================================================================

class TestValidateSize:
    """Tests for file size validation."""
    
    @pytest.mark.asyncio
    async def test_rejects_file_too_large(self, file_security_service):
        """Given file exceeding max size, when validating, then raises an application error."""
        # Create content larger than 500MB
        large_content = b"x" * (501 * 1024 * 1024)  # 501MB
        file = create_mock_upload_file("large.wav", large_content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 413
        assert "too large" in exc_info.value.message
    
    @pytest.mark.asyncio
    async def test_accepts_file_at_max_size(self, file_security_service):
        """Given file at exactly max size, when validating, then accepts it."""
        # Create content exactly at 500MB
        content = b"x" * (500 * 1024 * 1024)
        file = create_mock_upload_file("maxsize.wav", content)
        
        result = await file_security_service.validate(file)
        
        assert result["size"] == 500 * 1024 * 1024


# ============================================================================
# TEST: validate - Extension Validation
# ============================================================================

class TestValidateExtension:
    """Tests for file extension validation."""
    
    @pytest.mark.asyncio
    async def test_accepts_allowed_extension_wav(self, file_security_service):
        """Given .wav file, when validating, then accepts it."""
        file = create_mock_upload_file("recording.wav", b"audio content")
        
        result = await file_security_service.validate(file)
        
        assert result["safe_filename"].endswith(".wav")
    
    @pytest.mark.asyncio
    async def test_accepts_allowed_extension_mp3(self, file_security_service):
        """Given .mp3 file, when validating, then accepts it."""
        file = create_mock_upload_file("music.mp3", b"ID3" + b"\x00" * 50)
        
        result = await file_security_service.validate(file)
        
        assert result["safe_filename"].endswith(".mp3")
    
    @pytest.mark.asyncio
    async def test_rejects_disallowed_extension(self, file_security_service):
        """Given disallowed extension, when validating, then raises an application error."""
        file = create_mock_upload_file("script.exe", b"MZ" + b"\x00" * 50)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
        assert "not allowed" in exc_info.value.message
    
    @pytest.mark.asyncio
    async def test_rejects_php_extension(self, file_security_service):
        """Given .php extension, when validating, then raises an application error."""
        file = create_mock_upload_file("shell.php", b"<?php echo 'hello'; ?>")
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400


# ============================================================================
# TEST: validate - Dangerous Content Detection
# ============================================================================

class TestValidateDangerousContent:
    """Tests for dangerous content detection."""
    
    @pytest.mark.asyncio
    async def test_rejects_script_tag(self, file_security_service):
        """Given content with script tag, when validating, then raises an application error."""
        content = b"<script>alert('xss')</script>"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
        assert "disallowed content" in exc_info.value.message
    
    @pytest.mark.asyncio
    async def test_rejects_javascript_protocol(self, file_security_service):
        """Given content with javascript: protocol, when validating, then raises an application error."""
        content = b"javascript:alert(1)"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_rejects_php_content(self, file_security_service):
        """Given content with PHP tags, when validating, then raises an application error."""
        content = b"<?php system($_GET['cmd']); ?>"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_rejects_eval_function(self, file_security_service):
        """Given content with eval(, when validating, then raises an application error."""
        content = b"eval(user_input)"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_rejects_exec_function(self, file_security_service):
        """Given content with exec(, when validating, then raises an application error."""
        content = b"exec(command)"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_rejects_pe_executable_header(self, file_security_service):
        """Given content with PE header, when validating, then raises an application error."""
        # MZ header for Windows executables
        content = b"MZ\x90\x00" + b"\x00" * 100
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    async def test_detects_dangerous_content_case_insensitive(self, file_security_service):
        """Given mixed case dangerous content, when validating, then detects it."""
        content = b"<SCRIPT>alert(1)</SCRIPT>"
        file = create_mock_upload_file("test.wav", content)
        
        with pytest.raises(ApplicationError) as exc_info:
            await file_security_service.validate(file)
        
        assert exc_info.value.status_code == 400


# ============================================================================
# TEST: validate - File Hash
# ============================================================================

class TestValidateFileHash:
    """Tests for file hash generation."""
    
    @pytest.mark.asyncio
    async def test_generates_sha256_hash(self, file_security_service):
        """Given file content, when validating, then generates SHA-256 hash."""
        content = b"test audio content"
        file = create_mock_upload_file("test.wav", content)
        
        result = await file_security_service.validate(file)
        
        assert "file_hash" in result
        assert len(result["file_hash"]) == 64  # SHA-256 produces 64 hex characters
    
    @pytest.mark.asyncio
    async def test_same_content_produces_same_hash(self, file_security_service):
        """Given identical content, when validating, then produces same hash."""
        content = b"identical content"
        file1 = create_mock_upload_file("test1.wav", content)
        file2 = create_mock_upload_file("test2.wav", content)
        
        result1 = await file_security_service.validate(file1)
        result2 = await file_security_service.validate(file2)
        
        assert result1["file_hash"] == result2["file_hash"]
    
    @pytest.mark.asyncio
    async def test_different_content_produces_different_hash(self, file_security_service):
        """Given different content, when validating, then produces different hashes."""
        file1 = create_mock_upload_file("test1.wav", b"content one")
        file2 = create_mock_upload_file("test2.wav", b"content two")
        
        result1 = await file_security_service.validate(file1)
        result2 = await file_security_service.validate(file2)
        
        assert result1["file_hash"] != result2["file_hash"]


# ============================================================================
# TEST: validate - MIME Type Detection
# ============================================================================

class TestValidateMimeType:
    """Tests for MIME type detection."""
    
    @pytest.mark.asyncio
    async def test_returns_default_content_type_without_magic(self, file_security_service):
        """Given no magic library, when validating, then returns default content type."""
        with patch("app.services.storage.file_security_service.magic", None):
            file = create_mock_upload_file("test.wav", b"audio content")
            
            result = await file_security_service.validate(file)
            
            assert result["content_type"] == "application/octet-stream"
    
    @pytest.mark.asyncio
    async def test_detects_mime_type_with_magic(self, file_security_service):
        """Given magic library available, when validating, then detects MIME type."""
        mock_magic = MagicMock()
        mock_magic.from_buffer.return_value = "audio/wav"
        
        with patch("app.services.storage.file_security_service.magic", mock_magic):
            file = create_mock_upload_file("test.wav", b"RIFF" + b"\x00" * 100)
            
            result = await file_security_service.validate(file)
            
            assert result["content_type"] == "audio/wav"
    
    @pytest.mark.asyncio
    async def test_handles_magic_library_error(self, file_security_service):
        """Given magic library error, when validating, then falls back gracefully."""
        mock_magic = MagicMock()
        mock_magic.from_buffer.side_effect = RuntimeError("Magic error")
        
        with patch("app.services.storage.file_security_service.magic", mock_magic):
            file = create_mock_upload_file("test.wav", b"audio content")
            
            # Should not raise, should fall back to extension-based validation
            result = await file_security_service.validate(file)
            
            assert result["content_type"] == "application/octet-stream"


# ============================================================================
# TEST: Dangerous Patterns Constant
# ============================================================================

class TestDangerousPatterns:
    """Tests for dangerous patterns constant."""
    
    def test_contains_script_pattern(self, file_security_service):
        """Dangerous patterns should include script tag."""
        assert b"<script" in file_security_service.DANGEROUS_PATTERNS
    
    def test_contains_javascript_protocol(self, file_security_service):
        """Dangerous patterns should include javascript: protocol."""
        assert b"javascript:" in file_security_service.DANGEROUS_PATTERNS
    
    def test_contains_php_tag(self, file_security_service):
        """Dangerous patterns should include PHP opening tag."""
        assert b"<?php" in file_security_service.DANGEROUS_PATTERNS
    
    def test_contains_eval_function(self, file_security_service):
        """Dangerous patterns should include eval function."""
        assert b"eval(" in file_security_service.DANGEROUS_PATTERNS
    
    def test_contains_exec_function(self, file_security_service):
        """Dangerous patterns should include exec function."""
        assert b"exec(" in file_security_service.DANGEROUS_PATTERNS
    
    def test_contains_pe_header(self, file_security_service):
        """Dangerous patterns should include PE executable header."""
        assert b"MZ\x90\x00" in file_security_service.DANGEROUS_PATTERNS
