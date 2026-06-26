import os
import ast
from typing import Optional

# Load dotenv normally from the function app folder
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(_env_path)

def _logger():
    from core.logging import get_logger

    return get_logger(__name__)


def get_required_env_var(var_name: str) -> str:
    """Get a required environment variable or raise an error with a helpful message"""
    value = os.getenv(var_name)
    if not value:
        _logger().error("config.required_env_missing", variable=var_name)
        raise ValueError(f"Required environment variable {var_name} is not set")
    return value


def _connection_string_value(setting_name: str, key: str) -> Optional[str]:
    connection_string = os.getenv(setting_name, "")
    for part in connection_string.split(";"):
        name, separator, value = part.partition("=")
        if separator and name == key:
            return value
    return None


def resolve_log_level() -> str:
    configured_level = os.getenv("LOG_LEVEL")
    if configured_level:
        return configured_level.upper()

    environment = os.getenv("AZURE_FUNCTIONS_ENVIRONMENT", "").lower()
    return "DEBUG" if environment == "development" else "INFO"


class AppConfig:
    def __init__(self):
        try:
            prefix = os.getenv("AZURE_COSMOS_DB_PREFIX", "voice_")

            # Cosmos DB settings
            self.cosmos_endpoint: str = get_required_env_var("AZURE_COSMOS_ENDPOINT")
            self.cosmos_key: Optional[str] = os.getenv("AZURE_COSMOS_KEY")
            self.cosmos_database: str = os.getenv("AZURE_COSMOS_DB", "VoiceDB")
            self.cosmos_jobs_container: str = f"{prefix}jobs"
            self.cosmos_prompts_container: str = f"{prefix}prompts"            # Supported Audio Extensions List
            # Sessions container (prefix + 'user_sessions' to match existing default)
            self.cosmos_sessions_container: str = f"{prefix}user_sessions"
            
            # Analysis provider configuration
            allowed_providers = {"responses", "chat_completions"}
            provider = os.getenv("AZURE_OPENAI_DEFAULT_PROVIDER", "responses")
            if provider not in allowed_providers:
                raise ValueError(
                    f"Invalid analysis provider '{provider}'. "
                    f"Allowed values: {', '.join(sorted(allowed_providers))}"
                )
            self.default_analysis_provider: str = provider
            _logger().debug(
                "config.analysis_provider_selected",
                provider=self.default_analysis_provider,
            )
            
            self.supported_audio_extensions = {
                ".wav",  # Default audio streaming format
                ".pcm",  # PCM (Pulse Code Modulation)
                ".mp3",  # MPEG-1 Audio Layer 3
                ".ogg",  # Ogg Vorbis
                ".opus",  # Opus Codec
                ".flac",  # Free Lossless Audio Codec
                ".alaw",  # A-Law in WAV container
                ".mulaw",  # μ-Law in WAV container
                ".mp4",  # MP4 container (ANY format)
                ".wma",  # Windows Media Audio
                ".aac",  # Advanced Audio Codec
                ".amr",  # Adaptive Multi-Rate
                ".webm",  # WebM audio
                ".m4a",  # MPEG-4 Audio
                ".spx",  # Speex Codec
            }            # Supported Text Extensions List
            self.supported_text_extensions = {
                ".txt",   # Plain text files
                ".srt",   # SubRip subtitle files
                ".vtt",   # WebVTT subtitle files
                ".json",  # JSON files (for structured transcripts)
                ".md",    # Markdown files
                ".rtf",   # Rich Text Format
                ".csv",   # Comma-separated values (for structured data)
            }

            # Document Extensions (for future implementation)
            self.supported_document_extensions = {
                ".pdf",   # Portable Document Format
                ".docx",  # Microsoft Word document
            }

            # Image Extensions (for future OCR implementation)
            self.supported_image_extensions = {
                ".jpg", ".jpeg",  # JPEG images
                ".png",           # PNG images
                ".gif",           # GIF images
                ".bmp",           # Bitmap images
                ".tiff", ".tif",  # TIFF images
                ".webp",          # WebP images
            }            # All supported file extensions (currently processable)
            self.supported_extensions = self.supported_audio_extensions | self.supported_text_extensions | self.supported_document_extensions

            # All known extensions (including future implementations)
            self.all_known_extensions = (
                self.supported_audio_extensions | 
                self.supported_text_extensions | 
                self.supported_document_extensions | 
                self.supported_image_extensions
            )

            # Storage settings
            # Normalize storage account URL/container to avoid trailing/leading slash issues
            raw_storage_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "")
            self.storage_account_url: str = raw_storage_url.rstrip("/") if raw_storage_url else raw_storage_url
            raw_container = os.getenv("AZURE_STORAGE_RECORDINGS_CONTAINER", "")
            self.storage_recordings_container: str = raw_container.strip("/") if raw_container else raw_container
            self.storage_account_key: Optional[str] = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
            if not self.storage_account_key:
                self.storage_account_key = (
                    _connection_string_value("AzureWebJobsStorage", "AccountKey")
                    or _connection_string_value("audio", "AccountKey")
                )
            self.blob_trigger_lookup_retries: int = int(os.getenv("BLOB_TRIGGER_LOOKUP_RETRIES", "6"))
            self.blob_trigger_lookup_delay_seconds: float = float(
                os.getenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "2.0")
            )

            # Speech settings
            self.speech_max_speakers: int = int(os.getenv("AZURE_SPEECH_MAX_SPEAKERS", "10"))
            self.speech_transcription_locale: str = os.getenv(
                "AZURE_SPEECH_TRANSCRIPTION_LOCALE", "en-GB"
            )

            self.speech_endpoint: str = os.getenv("AZURE_SPEECH_ENDPOINT")
            self.speech_deployment: str = os.getenv("AZURE_SPEECH_DEPLOYMENT")
            self.speech_key: Optional[str] = os.getenv("AZURE_SPEECH_KEY")
            
            # Fast Transcription API settings
            self.enable_fast_transcription: bool = os.getenv("ENABLE_FAST_TRANSCRIPTION", "true").lower() == "true"
            self.fast_transcription_duration_threshold_minutes: int = int(os.getenv("FAST_TRANSCRIPTION_THRESHOLD_MINUTES", "120"))

            # Azure OpenAI settings
            self.azure_openai_endpoint: str = os.getenv("AZURE_OPENAI_ENDPOINT")
            self.azure_openai_deployment: str = os.getenv("AZURE_OPENAI_DEPLOYMENT")
            self.azure_openai_version: str = os.getenv("AZURE_OPENAI_API_VERSION")
            self.azure_openai_api_key: Optional[str] = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_OPENAI_KEY")

            # Reasoning settings
            self.enable_reasoning: bool = os.getenv("ENABLE_REASONING", "false").lower() == "true"
            self.reasoning_level: str = os.getenv("REASONING_LEVEL", "medium")

            self.speech_candidate_locales: str = os.getenv(
                "AZURE_SPEECH_CANDIDATE_LOCALES"
            )

            _logger().debug("config.initialization_completed")
        except (RuntimeError, TypeError, ValueError) as e:
            _logger().error(
                "config.initialization_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
