import os
import json
import io
import tempfile
from urllib.parse import urlparse
from typing import Any, Dict
from config import AppConfig
from core.logging import redact
from services.storage_service import StorageService
from azure.storage.blob import BlobServiceClient
from azure.storage.blob.aio import BlobServiceClient as AsyncBlobServiceClient
import structlog
from utils.file_types import get_file_type, get_supported_extensions
from utils.parsing import strip_vtt_tags, extract_vtt_speaker
import asyncio

FILE_PROCESSING_ERRORS = (RuntimeError, ValueError, TypeError, OSError)

# Document processing imports
DOC_PROCESSING_AVAILABLE = False
try:
    import docx2txt
except ImportError:
    docx2txt = None

try:
    from docx import Document
except ImportError:
    Document = None

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

if any((docx2txt, Document, PyPDF2)):
    DOC_PROCESSING_AVAILABLE = True

class FileProcessingError(Exception):
    """Custom exception for file processing errors."""
    pass

# Unique tag to identify system-generated files (transcription, analysis, etc.)
SYSTEM_GENERATED_TAG = "__SYS__"

class FileProcessingService:
    def __init__(self, config: AppConfig, storage_service: StorageService = None, credential: Any = None) -> None:
        """Initialize the FileProcessingService with config, optional storage service, and credential."""
        self.config = config
        self.logger = structlog.get_logger(__name__)
        self.storage_service = storage_service if storage_service is not None else StorageService(config)
        # Lazy credential creation - avoid importing azure.identity at module import time
        if credential is not None:
            self.credential = credential
        else:
            try:
                from azure.identity import DefaultAzureCredential
                self.credential = DefaultAzureCredential()
            except (ImportError, ModuleNotFoundError):
                self.credential = None
        self.logger.info("file_processing_service_initialized")

    def get_file_type(self, file_extension: str) -> str:
        """Return the file type for a given file extension."""
        return get_file_type(file_extension)

    def process_file(self, blob_url: str, file_extension: str) -> str:
        """Process a file from blob storage and return its text content."""
        file_type = self.get_file_type(file_extension)
        if file_type == "text":
            return self._process_text_file(blob_url, file_extension)
        elif file_type == "document":
            return self._process_document_file(blob_url, file_extension)
        else:
            raise FileProcessingError(f"Unsupported file type: {file_extension}")

    @staticmethod
    def get_supported_extensions() -> set:
        """Return all supported file extensions."""
        return get_supported_extensions()

    @staticmethod
    def is_system_generated_file(blob_name: str) -> bool:
        """Return True if the blob name indicates a system-generated file."""
        return SYSTEM_GENERATED_TAG in blob_name

    # --- Text file processing (from text_processing_service.py) ---
    def _download_blob(self, blob_url: str, as_text: bool = True) -> str | bytes:
        """Download blob content from Azure Blob Storage as text or bytes.

        Supports several blob URL formats:
        - Full URL: https://<account>.blob.core.windows.net/<container>/<blob>[?sas]
        - Relative path: <container>/<blob>
        - Bare blob name: <blob> (uses configured recordings container as default)
        """
        try:
            self.logger.info(
                "file_processing_blob_download_started",
                blob_url=blob_url,
                as_text=as_text,
            )

            parsed = urlparse(blob_url)
            blob_client = None

            # If we received a full URL (scheme + netloc), prefer using it.
            if parsed.scheme and parsed.netloc:
                # If the URL contains a SAS query or other query params, use from_blob_url so SAS is honoured.
                if parsed.query:
                    try:
                        from azure.storage.blob import BlobClient

                        self.logger.debug(
                            "file_processing_blob_download_using_blob_url",
                            blob_url=redact(blob_url, keep=120),
                        )
                        blob_client = BlobClient.from_blob_url(blob_url)
                    except FILE_PROCESSING_ERRORS:
                        # Fall back to parsing path and using service client
                        pass

                if blob_client is None:
                    path = parsed.path.lstrip("/")
                    parts = path.split("/", 1)
                    if len(parts) < 2 or not parts[0] or not parts[1]:
                        raise ValueError("Blob URL missing container or blob path")
                    container_name, blob_name = parts[0], parts[1]
                    blob_service_client = BlobServiceClient(
                        account_url=self.config.storage_account_url,
                        credential=self.credential,
                    )
                    blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

            else:
                # Relative path or bare blob name
                trimmed = blob_url.strip("/")
                parts = trimmed.split("/", 1)
                if len(parts) == 2:
                    container_name, blob_name = parts[0], parts[1]
                else:
                    # Only blob name provided, assume recordings container
                    container_name = self.config.storage_recordings_container
                    blob_name = parts[0]

                blob_service_client = BlobServiceClient(
                    account_url=self.config.storage_account_url,
                    credential=self.credential,
                )
                blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

            stream = blob_client.download_blob()
            blob_data = stream.readall()
            if as_text:
                return blob_data.decode('utf-8')
            return blob_data
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_blob_download_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                blob_url=redact(blob_url, keep=120),
                exc_info=True,
            )
            raise

    async def _download_blob_async(self, blob_url: str, as_text: bool = True) -> str | bytes:
        """Asynchronously download blob content from Azure Blob Storage as text or bytes."""
        try:
            self.logger.info(
                "file_processing_blob_download_async_started",
                blob_url=blob_url,
                as_text=as_text,
            )
            url_parts = blob_url.replace("https://", "").split("/")
            account_name = url_parts[0].split(".")[0]
            container_name = url_parts[1]
            blob_name = "/".join(url_parts[2:])
            async_blob_service_client = AsyncBlobServiceClient(
                account_url=self.config.storage_account_url,
                credential=self.credential,
            )
            async with async_blob_service_client:
                blob_client = async_blob_service_client.get_blob_client(
                    container=container_name, blob=blob_name
                )
                stream = await blob_client.download_blob()
                blob_data = await stream.readall()
                if as_text:
                    return blob_data.decode('utf-8')
                return blob_data
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_blob_download_async_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                blob_url=blob_url,
                exc_info=True,
            )
            raise

    def _download_text_file(self, blob_url: str) -> str:
        # Deprecated: use _download_blob(blob_url, as_text=True)
        return self._download_blob(blob_url, as_text=True)

    def _download_blob_content(self, blob_url: str) -> bytes:
        # Deprecated: use _download_blob(blob_url, as_text=False)
        return self._download_blob(blob_url, as_text=False)

    def _process_text_file(self, blob_url: str, file_extension: str) -> str:
        """Process a text file and return its content as a string."""
        try:
            content = self._download_blob(blob_url, as_text=True)
            ext = file_extension.lower()
            if ext == '.srt':
                return self._process_srt_content(content)
            elif ext == '.vtt':
                return self._process_vtt_content(content)
            elif ext == '.json':
                return self._process_json_content(content)
            else:
                return content
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_text_file_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                blob_url=blob_url,
                file_extension=file_extension,
                exc_info=True,
            )
            raise FileProcessingError(f"Failed to process text file: {str(e)}") from e

    def _process_srt_content(self, content: str) -> str:
        """Extract and format text from SRT subtitle content."""
        try:
            lines = content.strip().split('\n')
            text_lines = []
            current_speaker = None
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if line.isdigit() or '-->' in line or not line:
                    i += 1
                    continue
                if ':' in line and len(line.split(':', 1)) == 2:
                    speaker, text = line.split(':', 1)
                    speaker = speaker.strip()
                    text = text.strip()
                    if speaker != current_speaker:
                        text_lines.append(f"\n--- {speaker} ---")
                        current_speaker = speaker
                    text_lines.append(f"  {text}")
                else:
                    text_lines.append(f"  {line}")
                i += 1
            return '\n'.join(text_lines)
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_srt_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                exc_info=True,
            )
            return content

    def _process_vtt_content(self, content: str) -> str:
        """Extract and format text from VTT subtitle content."""
        try:
            lines = content.strip().split('\n')
            text_lines = []
            current_speaker = None
            start_processing = False
            for line in lines:
                line = line.strip()
                if line.startswith('WEBVTT') or line.startswith('NOTE'):
                    continue
                if '-->' in line:
                    start_processing = True
                    continue
                if not line:
                    continue
                if start_processing and line:
                    clean_line = strip_vtt_tags(line)
                    speaker, clean_line = extract_vtt_speaker(clean_line, current_speaker)
                    if speaker and speaker != current_speaker:
                        text_lines.append(f"\n--- {speaker} ---")
                        current_speaker = speaker
                    if clean_line:
                        text_lines.append(f"  {clean_line}")
            return '\n'.join(text_lines)
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_vtt_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                exc_info=True,
            )
            return content

    def _process_json_content(self, content: str) -> str:
        """Extract and format transcript text from JSON content."""
        try:
            data = json.loads(content)
            text_lines = []
            if isinstance(data, list):
                text_lines.extend(self._extract_transcript_from_json_list(data))
            elif isinstance(data, dict):
                text_lines.extend(self._extract_transcript_from_json_dict(data))
            if not text_lines:
                text_lines.append(json.dumps(data, indent=2))
            return '\n'.join(text_lines)
        except json.JSONDecodeError as e:
            self.logger.warning(
                "file_processing_json_parse_failed",
                error_details=str(e),
            )
            return content
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_json_failed",
                error_type=type(e).__name__,
                error_details=str(e),
                exc_info=True,
            )
            return content

    def _extract_transcript_from_json_list(self, data: list) -> list[str]:
        """Extract transcript lines from a list of JSON transcript segments."""
        text_lines = []
        for item in data:
            if isinstance(item, dict):
                text = item.get('text', item.get('content', item.get('transcript', '')))
                speaker = item.get('speaker', item.get('name', item.get('user', '')))
                if text:
                    if speaker:
                        text_lines.append(f"--- {speaker} ---")
                    text_lines.append(f"  {text}")
        return text_lines

    def _extract_transcript_from_json_dict(self, data: dict) -> list[str]:
        """Extract transcript lines from a dict containing transcript arrays or text fields."""
        text_lines = []
        transcript_keys = ['transcript', 'segments', 'results', 'utterances', 'messages']
        for key in transcript_keys:
            if key in data and isinstance(data[key], list):
                text_lines.extend(self._extract_transcript_from_json_list(data[key]))
                break
        if not text_lines:
            if 'text' in data:
                text_lines.append(str(data['text']))
            elif 'content' in data:
                text_lines.append(str(data['content']))
        return text_lines

    # --- Document file processing (from document_processing_service.py) ---
    def _process_document_file(self, blob_url: str, file_extension: str) -> str:
        """Process a document file and return its extracted text."""
        if not DOC_PROCESSING_AVAILABLE:
            raise FileProcessingError(self._get_processing_unavailable_message(blob_url, file_extension))
        try:
            file_content = self._download_blob(blob_url, as_text=False)
            ext = file_extension.lower()
            if ext == '.pdf':
                return self._extract_pdf_text(file_content)
            elif ext == '.docx':
                return self._extract_docx_text(file_content)
            else:
                raise FileProcessingError(f"Unsupported document type: {file_extension}")
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_document_failed",
                blob_url=blob_url,
                file_extension=file_extension,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise FileProcessingError(f"Error processing {file_extension} document: {str(e)}") from e

    def _get_processing_unavailable_message(self, blob_url: str, file_extension: str) -> str:
        """Return a message indicating document processing is unavailable."""
        return f"""
--- Document Processing Unavailable ---
File: {blob_url}
Type: {file_extension}
Status: Document processing libraries not installed.

To enable document processing, install the required dependencies:
pip install python-docx docx2txt PyPDF2

Missing libraries prevent automatic text extraction.
Please convert to a text format (.txt, .srt, .vtt, .json) for analysis.
""".strip()

    def _extract_pdf_text(self, file_content: bytes) -> str:
        """Extract text from a PDF file's bytes."""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text_parts.append(page_text)
                except FILE_PROCESSING_ERRORS as e:
                    self.logger.warning(
                        "file_processing_pdf_page_extract_failed",
                        page_number=page_num,
                        error=str(e),
                        error_type=type(e).__name__,
                    )
                    continue
            return '\n\n'.join(text_parts)
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_pdf_extract_failed",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise

    def _extract_docx_text(self, file_content: bytes) -> str:
        """Extract text from a DOCX file's bytes.

        Strategy:
        - Prefer in-memory parsing with python-docx (avoids temp files and Windows delete races).
        - Fall back to docx2txt which requires a temporary file on disk.
        - Ensure temp files are closed before attempting removal and log (but do not raise) if removal fails.
        """
        try:
            # Primary: use python-docx in-memory (Document accepts a file-like object)
            try:
                if Document is None:
                    raise RuntimeError("python-docx is not installed")
                doc = Document(io.BytesIO(file_content))
                text_parts = [p.text for p in doc.paragraphs if p.text.strip()]
                return '\n'.join(text_parts)
            except FILE_PROCESSING_ERRORS as primary_exc:
                # Fallback: write bytes to a temporary file and use docx2txt
                tmp_path = None
                try:
                    with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as tmp_file:
                        tmp_file.write(file_content)
                        tmp_file.flush()
                        tmp_path = tmp_file.name
                    # tmp_file closed here - safe to hand the path to docx2txt
                    if docx2txt is None:
                        raise RuntimeError("docx2txt is not installed")
                    text = docx2txt.process(tmp_path)
                    return text or ""
                finally:
                    if tmp_path:
                        try:
                            os.unlink(tmp_path)
                        except FILE_PROCESSING_ERRORS as unlink_exc:
                            # Don't fail the extraction just because temp removal failed
                            self.logger.warning(
                                "file_processing_docx_temp_remove_failed",
                                tmp_path=tmp_path,
                                error=str(unlink_exc),
                                error_type=type(unlink_exc).__name__,
                            )
        except FILE_PROCESSING_ERRORS as e:
            self.logger.error(
                "file_processing_docx_extract_failed",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise

