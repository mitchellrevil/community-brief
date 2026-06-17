import mimetypes
import os
import shutil
from datetime import UTC, datetime, timedelta
from typing import Tuple, Optional
from app.core.logging import get_logger

logger = get_logger(__name__)

FILE_UTILS_ERRORS = (RuntimeError, OSError, ValueError, TypeError)

# Audio processing for duration extraction
try:
    from mutagen import File as MutagenFile
    from mutagen.mp3 import MP3
    from mutagen.wave import WAVE
    from mutagen.mp4 import MP4
    from mutagen.flac import FLAC
    from mutagen.oggvorbis import OggVorbis
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False


class FileUtils:
    AUDIO_EXTENSIONS = {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
        "ogg": "audio/ogg",
        "flac": "audio/flac",
        "webm": "audio/webm",
    }

    def __init__(self):
        self.logger = logger

    @classmethod
    def get_extension(cls, filename: str) -> str:
        """Get clean file extension without dot"""
        extension = filename.split(".")[-1].lower() if "." in filename else ""
        return extension.lstrip(".")

    @classmethod
    def get_audio_duration(cls, file_path: str) -> Optional[float]:
        """
        Extract audio duration in seconds from an audio file.

        Args:
            file_path: Path to the audio file

        Returns:
            Duration in seconds as float, or None if extraction fails
        """
        if not MUTAGEN_AVAILABLE:
            logger.warning("audio_duration_mutagen_unavailable")
            return None

        try:
            if not os.path.exists(file_path):
                logger.error("audio_duration_file_missing", file_path=file_path)
                return None

            # Use mutagen to extract audio metadata
            audio_file = MutagenFile(file_path)

            if audio_file is None:
                logger.error("audio_duration_file_unreadable", file_path=file_path)
                return None

            if hasattr(audio_file, "info") and hasattr(audio_file.info, "length"):
                duration = audio_file.info.length
                if duration and duration > 0:
                    logger.info("audio_duration_extracted", file_path=file_path, duration_seconds=round(duration, 2))
                    return float(duration)

            logger.warning("audio_duration_missing", file_path=file_path)
            return None

        except FILE_UTILS_ERRORS as exc:
            logger.error("audio_duration_extract_failed", file_path=file_path, error=str(exc), exc_info=True)
            return None

    @classmethod
    def get_audio_duration_minutes(cls, file_path: str) -> Optional[float]:
        """
        Extract audio duration in minutes from an audio file.

        Args:
            file_path: Path to the audio file

        Returns:
            Duration in minutes as float, or None if extraction fails
        """
        duration_seconds = cls.get_audio_duration(file_path)
        if duration_seconds is not None:
            return duration_seconds / 60.0
        return None

    @classmethod
    def clean_temp_files(cls, temp_dir: str, max_age_hours: int = 24) -> None:
        """Clean up temporary files older than specified hours"""
        if not os.path.exists(temp_dir):
            return

        current_time = datetime.now(UTC)
        for filename in os.listdir(temp_dir):
            filepath = os.path.join(temp_dir, filename)
            if os.path.isfile(filepath):
                file_modified = datetime.fromtimestamp(os.path.getmtime(filepath), UTC)
                if current_time - file_modified > timedelta(hours=max_age_hours):
                    try:
                        os.remove(filepath)
                        logger.info("temp_file_removed", file_path=filepath)
                    except FILE_UTILS_ERRORS as exc:
                        logger.error("temp_file_remove_failed", file_path=filepath, error=str(exc), exc_info=True)

    class UploadTooLargeError(Exception):
        pass

    @classmethod
    def validate_audio_file(
        cls, file_path: str, max_size_mb: int = 500
    ) -> Tuple[bool, str]:
        """Validate audio file format and size"""
        try:
            # Check if file exists
            if not os.path.exists(file_path):
                return False, "File does not exist"

            # Check file extension
            _, file_extension = os.path.splitext(file_path)
            file_extension = file_extension.replace(".", "").lower()

            if file_extension not in cls.AUDIO_EXTENSIONS:
                return (
                    False,
                    f"Unsupported file format '{file_extension}'. "
                    f"Supported formats: {', '.join(cls.AUDIO_EXTENSIONS.keys())}",
                )

            return True, "File is valid"

        except FILE_UTILS_ERRORS as e:
            return False, f"Error validating file: {str(e)}"

    @classmethod
    def save_upload_to_temp(cls, upload_file, dest_path: str, max_bytes: int = 1073741824) -> None:
        """Save an UploadFile-like object to disk with a hard byte limit.

        Reads in chunks and raises UploadTooLargeError when the limit is exceeded.
        """
        chunk_size = 64 * 1024
        total = 0
        try:
            with open(dest_path, "wb") as out_file:
                while True:
                    chunk = upload_file.file.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    total += len(chunk)
                    if total > max_bytes:
                        raise cls.UploadTooLargeError(f"Upload exceeds maximum size of {max_bytes} bytes")
        except AttributeError:
            # Not an UploadFile-like object
            raise

    @classmethod
    def get_safe_temp_path(cls, original_filename: str, temp_dir: str = "temp") -> str:
        """Generate a safe temporary file path"""
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        base_name = os.path.splitext(original_filename)[0]
        extension = os.path.splitext(original_filename)[1].lower()
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{base_name}_{timestamp}{extension}"
        return os.path.join(temp_dir, safe_filename)

    @classmethod
    def ensure_directory_exists(cls, directory: str) -> None:
        """Ensure the specified directory exists"""
        if not os.path.exists(directory):
            os.makedirs(directory)
            logger.info("directory_created", directory=directory)
