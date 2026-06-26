import os
import asyncio
import inspect
from typing import Optional, AsyncGenerator
from azure.storage.blob.aio import BlobServiceClient, BlobClient
from azure.storage.blob import BlobSasPermissions, ContentSettings, generate_blob_sas
from azure.identity.aio import DefaultAzureCredential
from azure.core.exceptions import AzureError
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
from azure.core.exceptions import ResourceNotFoundError
from ...core.config import AppConfig
from ...core.logging import get_logger
from ...utils.cache_utils import TTLCache

BLOB_SERVICE_ERRORS = (AzureError, RuntimeError, OSError, ValueError, TypeError)
BLOB_STREAM_ERRORS = (AzureError, RuntimeError, OSError, ValueError, TypeError)

_sas_url_cache = TTLCache[str](default_ttl=300.0)


class StorageService:
    def __init__(self, config: AppConfig):
        self.config = config
        self.logger = get_logger(__name__)
        
        if config.azure_storage_key:
            self.logger.info("azure_storage_key_auth_configured")
            self.credential = config.azure_storage_key
        else:
            self.logger.info("azure_storage_managed_identity_auth_configured")
            self.credential = DefaultAzureCredential()

        self.blob_service_client = BlobServiceClient(
            account_url=self.config.azure_storage_account_url, credential=self.credential
        )

        self._user_delegation_key = None
        self._user_delegation_key_expiration: Optional[datetime] = None
        self._delegation_key_lock = asyncio.Lock()

    async def close(self):
        """Close the async blob service client."""
        await self.blob_service_client.close()
        # Close credential if it supports an async close() method.
        # Avoid isinstance checks which break when tests patch the class with mocks.
        try:
            close_fn = getattr(self.credential, "close", None)
            if close_fn and callable(close_fn):
                await close_fn()
        except BLOB_SERVICE_ERRORS:
            # Best-effort close, ignore errors during teardown
            pass

    async def generate_sas_token(self, blob_url: str) -> Optional[str]:
        """Generate SAS token for a blob URL using managed identity"""
        try:
            if not blob_url:
                return None

            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")
            if len(path_parts) < 2:
                self.logger.warning("blob_url_invalid", blob_url=blob_url)
                return None

            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])
            account_name = parsed_url.netloc.split(".")[0]

            now = datetime.now(UTC)
            start_time = now - timedelta(minutes=5)
            expiry_time = now + timedelta(hours=8)

            if isinstance(self.credential, str):
                sas_token = generate_blob_sas(
                    account_name=account_name,
                    container_name=container_name,
                    blob_name=blob_name,
                    account_key=self.credential,
                    permission=BlobSasPermissions(read=True),
                    start=start_time,
                    expiry=expiry_time,
                )
            else:
                user_delegation_key = await self._get_user_delegation_key(start_time)
                if user_delegation_key is None:
                    return None

                sas_token = generate_blob_sas(
                    account_name=account_name,
                    container_name=container_name,
                    blob_name=blob_name,
                    user_delegation_key=user_delegation_key,
                    permission=BlobSasPermissions(read=True),
                    start=start_time,
                    expiry=expiry_time,
                )

            self.logger.debug(
                "blob_sas_token_generated",
                container=container_name,
                blob_name=blob_name[:50],
                start_time=start_time.isoformat(),
                expiry_time=expiry_time.isoformat(),
            )
            return sas_token

        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_sas_token_generation_failed",
                blob_url=blob_url,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            return None

    async def generate_upload_sas(self, original_filename: str) -> dict:
        """Generate a write-only SAS URL for direct client-to-blob upload.

        Returns a dict with ``blob_url``, ``sas_url`` (full URL with token),
        ``blob_name``, and ``container`` so the caller can upload directly from
        the browser and later reference the blob.
        """
        container_name = self.config.azure_storage_recordings_container

        # Build the same blob path as upload_file() for consistency
        sanitized_filename = original_filename.replace(" ", "_")
        current_date = datetime.now(UTC).strftime("%Y-%m-%d")
        timestamp = datetime.now(UTC).strftime("%H%M%S_%f")[:-3]
        file_name_without_ext = os.path.splitext(sanitized_filename)[0]
        blob_name = f"{current_date}/{file_name_without_ext}_{timestamp}/{sanitized_filename}"

        parsed = urlparse(self.config.azure_storage_account_url)
        account_name = parsed.netloc.split(".")[0]

        now = datetime.now(UTC)
        start_time = now - timedelta(minutes=5)
        expiry_time = now + timedelta(hours=1)  # short-lived for security

        permissions = BlobSasPermissions(create=True, write=True)

        if isinstance(self.credential, str):
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name=container_name,
                blob_name=blob_name,
                account_key=self.credential,
                permission=permissions,
                start=start_time,
                expiry=expiry_time,
            )
        else:
            udk = await self._get_user_delegation_key(start_time)
            if udk is None:
                raise RuntimeError("Unable to obtain user delegation key for SAS generation")
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name=container_name,
                blob_name=blob_name,
                user_delegation_key=udk,
                permission=permissions,
                start=start_time,
                expiry=expiry_time,
            )

        blob_url = f"{self.config.azure_storage_account_url.rstrip('/')}/{container_name}/{blob_name}"
        sas_url = f"{blob_url}?{sas_token}"

        self.logger.info(
            "blob_upload_sas_token_generated",
            blob_name=blob_name,
            expiry=expiry_time.isoformat(),
        )
        return {
            "blob_url": blob_url,
            "sas_url": sas_url,
            "blob_name": blob_name,
            "container": container_name,
            "expiry": expiry_time.isoformat(),
        }

    async def verify_blob_exists(self, blob_url: str) -> int:
        """Verify a blob exists and return its size in bytes.

        Raises ``FileNotFoundError`` if the blob does not exist.
        """
        parsed_url = urlparse(blob_url)
        path_parts = parsed_url.path.strip("/").split("/")
        if len(path_parts) < 2:
            raise ValueError(f"Invalid blob URL: {blob_url}")

        container_name = path_parts[0]
        blob_name = "/".join(path_parts[1:])

        container_client = self.blob_service_client.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)
        try:
            props = await blob_client.get_blob_properties()
            return props.size
        except ResourceNotFoundError:
            raise FileNotFoundError(f"Blob not found: {blob_url}")

    async def set_blob_metadata(self, blob_url: str, metadata: dict) -> bool:
        """Set custom metadata properties on a blob.

        This is used to attach correlation_id and file_name to blobs so Azure Functions
        can retrieve jobs by blob metadata instead of relying on URL matching.

        Args:
            blob_url: Full URL to the blob (e.g., https://<storage>.blob.core.windows.net/<container>/<blob>)
            metadata: Dictionary of metadata key-value pairs. Keys must be lowercase ASCII letters/numbers.

        Returns:
            True if metadata was set successfully, False on any error.

        Note:
            This method is non-fatal: failures are logged but don't raise exceptions.
            The upload flow should succeed even if metadata attachment fails.
        """
        if not blob_url:
            self.logger.warning("blob_metadata_set_empty_url")
            return False

        try:
            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")

            if len(path_parts) < 2:
                self.logger.warning("blob_metadata_url_invalid", blob_url=blob_url)
                return False

            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])

            container_client = self.blob_service_client.get_container_client(container_name)
            blob_client = container_client.get_blob_client(blob_name)

            await blob_client.set_blob_metadata(metadata)

            self.logger.info(
                "blob_metadata_set_succeeded",
                blob_url=blob_url[:80],
                metadata_keys=list(metadata.keys()),
                correlation_id=metadata.get("correlationid", "unknown"),
                blob_filename=metadata.get("filename", "unknown"),
            )
            return True

        except ResourceNotFoundError:
            self.logger.warning(
                "blob_metadata_set_blob_not_found",
                blob_url=blob_url[:80],
                correlation_id=metadata.get("correlationid", "unknown") if metadata else "unknown",
            )
            return False
        except AzureError as e:
            self.logger.warning(
                "blob_metadata_set_azure_error",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                correlation_id=metadata.get("correlationid", "unknown") if metadata else "unknown",
            )
            return False
        except BLOB_SERVICE_ERRORS as e:
            self.logger.warning(
                "blob_metadata_set_unexpected_error",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                correlation_id=metadata.get("correlationid", "unknown") if metadata else "unknown",
                exc_info=True
            )
            return False

    async def add_sas_token_to_url(self, blob_url: str) -> str:
        """Add SAS token to blob URL if not already present"""
        if not blob_url:
            return blob_url

        if '?' in blob_url:
            self.logger.debug("blob_url_already_has_query", blob_url=blob_url[:100])
            return blob_url

        cached = await _sas_url_cache.get(blob_url)
        if cached is not None:
            return cached

        sas_token = await self.generate_sas_token(blob_url)
        if sas_token:
            sas_url = f"{blob_url}?{sas_token}"
            await _sas_url_cache.set(blob_url, sas_url)
            return sas_url
        
        self.logger.warning("blob_sas_token_unavailable", blob_url=blob_url)
        return blob_url

    async def _get_user_delegation_key(self, start_time: datetime):
        """Return a cached user delegation key or fetch a new one if needed."""
        if isinstance(self.credential, str):
            return None

        try:
            async with self._delegation_key_lock:
                now = datetime.now(UTC)
                cached_expiration = self._user_delegation_key_expiration
                if cached_expiration is not None and cached_expiration.tzinfo is None:
                    cached_expiration = cached_expiration.replace(tzinfo=UTC)
                if (
                    self._user_delegation_key is not None
                    and cached_expiration is not None
                    and now < cached_expiration - timedelta(minutes=1)
                ):
                    return self._user_delegation_key

                key_expiry_time = now + timedelta(hours=12)
                self._user_delegation_key = await self.blob_service_client.get_user_delegation_key(
                    key_start_time=start_time,
                    key_expiry_time=key_expiry_time,
                )
                self._user_delegation_key_expiration = key_expiry_time
                return self._user_delegation_key
        except BLOB_SERVICE_ERRORS as exc:
            self.logger.error("user_delegation_key_refresh_failed", exc_info=True, error=str(exc))
            return None

    async def download_blob_bytes(self, blob_url: str) -> bytes:
        """Download raw bytes from a blob URL.
        
        Args:
            blob_url: Full URL to the blob to download
            
        Returns:
            Raw bytes content of the blob
            
        Raises:
            FileNotFoundError: If blob does not exist
            ValueError: If blob URL is invalid
            Exception: For other download errors
        """
        if not blob_url:
            raise ValueError("Blob URL cannot be empty")
            
        try:
            self.logger.debug("blob_bytes_download_started", blob_url=blob_url[:80])
            
            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")
            
            if len(path_parts) < 2:
                self.logger.error("blob_url_invalid", blob_url=blob_url)
                raise ValueError(f"Invalid blob URL format: {blob_url}")
                
            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])
            
            container_client = self.blob_service_client.get_container_client(
                container_name
            )
            blob_client = container_client.get_blob_client(blob_name)
            
            stream = await blob_client.download_blob()
            blob_data = await stream.readall()
            
            self.logger.info(
                "blob_bytes_download_succeeded",
                blob_url=blob_url[:80],
                size_bytes=len(blob_data),
            )
            
            return blob_data
            
        except ResourceNotFoundError as e:
            self.logger.error("blob_bytes_download_not_found", blob_url=blob_url, exc_info=True)
            raise FileNotFoundError(f"Blob not found: {blob_url}") from e
        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_bytes_download_failed",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )
            raise

    async def upload_blob_bytes(self, original_filename: str, file_data: bytes) -> str:
        """Upload raw bytes to blob storage with automatic naming.
        
        Args:
            original_filename: Original filename for the blob
            file_data: Raw bytes to upload
            
        Returns:
            Full blob URL of the uploaded blob
            
        Raises:
            Exception: If upload fails
        """
        if not original_filename:
            raise ValueError("Original filename cannot be empty")
        if not isinstance(file_data, bytes):
            raise ValueError("File data must be bytes")
            
        try:
            container_name = self.config.azure_storage_recordings_container
            
            # Generate blob name with date and nested structure including timestamp for uniqueness
            sanitized_filename = original_filename.replace(" ", "_")
            current_date = datetime.now(UTC).strftime("%Y-%m-%d")
            timestamp = datetime.now(UTC).strftime("%H%M%S_%f")[:-3]  # HHMMSS_milliseconds
            file_name_without_ext = os.path.splitext(sanitized_filename)[0]
            blob_name = f"{current_date}/{file_name_without_ext}_{timestamp}/{sanitized_filename}"

            container_client = self.blob_service_client.get_container_client(
                container_name
            )
            blob_client = container_client.get_blob_client(blob_name)

            self.logger.info(
                "blob_bytes_upload_started",
                blob_name=blob_name,
                size_bytes=len(file_data),
            )
            
            await blob_client.upload_blob(file_data, overwrite=True)
            
            blob_url = blob_client.url
            self.logger.info(
                "blob_bytes_upload_succeeded",
                blob_url=blob_url[:80],
                size_bytes=len(file_data),
            )
            
            return blob_url

        except AzureError as e:
            self.logger.error(
                "blob_bytes_upload_azure_error",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise
        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_bytes_upload_failed",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise

    async def download_text_from_blob(self, blob_url: str) -> Optional[str]:
        """Download text content from a blob URL."""
        if not blob_url:
            return None
            
        try:
            self.logger.debug("blob_text_download_started", blob_url=blob_url[:80])
            
            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")
            
            if len(path_parts) < 2:
                self.logger.error("blob_url_invalid", blob_url=blob_url)
                return None
                
            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])
            
            # Get container client (some mocks return coroutine, handle awaitables)
            container_client = self.blob_service_client.get_container_client(
                container_name
            )
            # In Azure SDK, get_container_client is synchronous but returns an async client.
            # However, some mocks might make it async. We assume standard SDK behavior here:
            # it returns a client immediately. If it's an async client, we use it.
            # If tests mock it as a coroutine, they should be fixed.
            
            blob_client = container_client.get_blob_client(blob_name)
            
            stream = await blob_client.download_blob()
            blob_data = await stream.readall()
            text_content = blob_data.decode('utf-8')
            
            self.logger.info(
                "blob_text_download_succeeded",
                blob_url=blob_url[:80],
                content_length=len(text_content),
            )
            
            return text_content
            
        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_text_download_failed",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )
            return None

    async def upload_text_to_blob(
        self,
        blob_url: str,
        text_content: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
    ) -> str:
        """Replace an existing blob with UTF-8 text content."""
        if not blob_url:
            raise ValueError("Blob URL cannot be empty")

        try:
            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")

            if len(path_parts) < 2:
                self.logger.error("blob_url_invalid", blob_url=blob_url)
                raise ValueError(f"Invalid blob URL format: {blob_url}")

            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])

            container_client = self.blob_service_client.get_container_client(container_name)
            blob_client = container_client.get_blob_client(blob_name)
            payload = text_content.encode("utf-8")

            await blob_client.upload_blob(
                payload,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )

            self.logger.info(
                "blob_text_upload_succeeded",
                blob_url=blob_url[:80],
                size_bytes=len(payload),
            )
            return blob_client.url

        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_text_upload_failed",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise

    async def download_docx_text_from_blob(self, blob_url: str) -> Optional[str]:
        """Download .docx file from blob and extract text content.
        
        Args:
            blob_url: Full URL to the .docx blob to download
            
        Returns:
            Extracted text content from the .docx, or None if download/extraction fails
        """
        if not blob_url:
            return None
            
        try:
            self.logger.debug("blob_docx_download_started", blob_url=blob_url[:80])
            
            # Extract container and blob name from URL path
            parsed_url = urlparse(blob_url)
            path_parts = parsed_url.path.strip("/").split("/")
            
            if len(path_parts) < 2:
                self.logger.error("blob_url_invalid", blob_url=blob_url)
                return None
                
            container_name = path_parts[0]
            blob_name = "/".join(path_parts[1:])
            
            # Get blob client
            container_client = self.blob_service_client.get_container_client(
                container_name
            )
            
            blob_client = container_client.get_blob_client(blob_name)
            
            # Download .docx file as bytes
            stream = await blob_client.download_blob()
            blob_data = await stream.readall()
            
            # Extract text from .docx (run in thread since python-docx is sync)
            def _extract_text(data):
                from docx import Document
                import io
                doc = Document(io.BytesIO(data))
                text_parts = []
                for paragraph in doc.paragraphs:
                    if paragraph.text.strip():
                        text_parts.append(paragraph.text)
                return "\n\n".join(text_parts)

            extracted_text = await asyncio.to_thread(_extract_text, blob_data)
            
            self.logger.info(
                "blob_docx_text_extract_succeeded",
                blob_url=blob_url[:80],
                content_length=len(extracted_text),
            )
            
            return extracted_text
            
        except ImportError as ie:
            self.logger.error(
                "blob_docx_dependency_missing",
                blob_url=blob_url[:80],
                error=str(ie),
            )
            return None
        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_docx_text_extract_failed",
                blob_url=blob_url[:80],
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )
            return None

    async def upload_file(self, file_path: str, original_filename: str) -> str:
        """Upload a file to blob storage"""
        try:
            container_client = self.blob_service_client.get_container_client(
                self.config.azure_storage_recordings_container
            )            # Sanitize filename - replace spaces with underscores
            sanitized_filename = original_filename.replace(" ", "_")
            self.logger.debug(
                "blob_upload_filename_sanitized",
                original_filename=original_filename,
                sanitized_filename=sanitized_filename,
            )
            
            # Generate blob name with date and nested structure including timestamp for uniqueness
            current_date = datetime.now(UTC).strftime("%Y-%m-%d")
            timestamp = datetime.now(UTC).strftime("%H%M%S_%f")[:-3]  # HHMMSS_milliseconds
            file_name_without_ext = os.path.splitext(sanitized_filename)[0]
            blob_name = f"{current_date}/{file_name_without_ext}_{timestamp}/{sanitized_filename}"

            blob_client = container_client.get_blob_client(blob_name)

            self.logger.info("blob_file_upload_started", blob_name=blob_name)
            
            # Read file in thread to avoid blocking (max 500MB per config)
            async with asyncio.Lock():
                def _read_file():
                    with open(file_path, "rb") as data:
                        return data.read()
                
                file_data = await asyncio.to_thread(_read_file)
                await blob_client.upload_blob(file_data, overwrite=True)

            return blob_client.url

        except AzureError as e:
            self.logger.error(
                "blob_file_upload_azure_error",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_file_upload_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    async def generate_and_upload_docx(self, analysis_text: str, blob_name: str, add_title: bool = True) -> str:
        """Generate a DOCX from analysis text and upload to blob storage. Return the blob URL.
        
        Args:
            analysis_text: The text content to convert to DOCX
            blob_name: The name/path for the blob in storage
            add_title: Whether to add "Analysis Report" title at the top (True for new, False for edited)
        """
        try:
            # Generate DOCX in a thread since python-docx is CPU bound/sync
            def _generate_docx():
                from docx import Document
                from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
                import io
                import re

                # Create DOCX in memory
                doc = Document()
                
                # Add title only for new documents (not edits)
                if add_title:
                    title = doc.add_heading('Analysis Report', 0)
                    title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
                
                # Process the analysis text and format properly
                sections = analysis_text.split("\n\n")
                
                for section in sections:
                    if not section.strip():
                        continue
                        
                    lines = section.split("\n")
                    if not lines:
                        continue
                        
                    # Check if this is a section header - improved detection for markdown
                    first_line = lines[0].strip()
                    
                    if (first_line.startswith("#") or 
                        first_line.startswith("**") and first_line.endswith("**") or
                        first_line.isupper() or 
                        (len(first_line) < 100 and first_line.endswith(":")) or
                        re.match(r'^\d+\.\s*\*\*.*\*\*', first_line)):  # Numbered sections with bold
                        # This is likely a heading
                        heading_text = (first_line
                                      .replace("#", "")
                                      .replace("**", "")  # Remove markdown bold
                                      .strip()
                                      .rstrip(":"))
                        
                        # Remove numbering if present
                        heading_text = re.sub(r'^\d+\.\s*', '', heading_text)
                        
                        doc.add_heading(heading_text, level=1)
                        
                        # Add the rest of the lines as content
                        content_lines = lines[1:]
                    else:
                        # This is regular content
                        content_lines = lines
                    
                    # Process content lines
                    for line in content_lines:
                        line = line.strip()
                        if not line:
                            continue
                            
                        # Check if this is a bullet point
                        if line.startswith(("-", "*", "•")) or re.match(r'^\d+\.', line):
                            # Clean bullet text and add as bullet point
                            bullet_text = re.sub(r'^[-*•\d+\.]\s*', '', line)
                            # Add paragraph with formatting preserved
                            p = doc.add_paragraph(style='List Bullet')
                            # Simplified text adding for thread safety/simplicity
                            p.add_run(bullet_text)
                        else:
                            # Add as regular paragraph with formatting preserved
                            p = doc.add_paragraph()
                            p.add_run(line)
                    
                    # Add spacing between sections
                    doc.add_paragraph()

                # Save DOCX to buffer
                buffer = io.BytesIO()
                doc.save(buffer)
                return buffer.getvalue()

            docx_content = await asyncio.to_thread(_generate_docx)

            # Upload DOCX
            container_client = self.blob_service_client.get_container_client(
                self.config.azure_storage_recordings_container
            )

            blob_client = container_client.get_blob_client(blob_name)

            self.logger.info("blob_docx_upload_started", blob_name=blob_name)
            await blob_client.upload_blob(docx_content, overwrite=True)
            return blob_client.url

        except BLOB_SERVICE_ERRORS as e:
            self.logger.error(
                "blob_docx_upload_failed",
                blob_name=blob_name,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
    
    def _add_formatted_text(self, paragraph, text: str):
        """
        Add text to a paragraph with markdown formatting support.
        Handles **bold**, *italic*, and normal text.
        
        Args:
            paragraph: python-docx paragraph object
            text: Text potentially containing markdown formatting
        """
        import re
        
        # Pattern matches: **bold** (must have 2 asterisks) or *italic* (must have 1 asterisk, not 2)
        # This regex uses non-greedy matching and looks ahead to prevent false matches
        pattern = r'(\*\*(.+?)\*\*|\*(.+?)\*(?!\*))'
        
        last_end = 0
        for match in re.finditer(pattern, text):
            # Add any normal text before this match
            if match.start() > last_end:
                normal_text = text[last_end:match.start()]
                paragraph.add_run(normal_text)
            
            # Add the formatted text
            if match.group(1).startswith('**'):
                # Bold text
                bold_text = match.group(2)
                run = paragraph.add_run(bold_text)
                run.bold = True
            else:
                # Italic text
                italic_text = match.group(3)
                run = paragraph.add_run(italic_text)
                run.italic = True
            
            last_end = match.end()
        
        # Add any remaining text after the last match
        if last_end < len(text):
            remaining_text = text[last_end:]
            paragraph.add_run(remaining_text)

    async def stream_blob_content(
        self, file_blob_url: str
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream content from a blob asynchronously.

        Args:
            file_blob_url (str): URL of the blob to stream.

        Returns:
            AsyncGenerator[bytes, None]: Yields chunks of file content asynchronously.

        Raises:
            ValueError: If the provided URL is invalid or missing required parts.
            ResourceNotFoundError: If the blob does not exist.
            Exception: For other unexpected errors.
        """
        if not file_blob_url:
            raise ValueError("Blob URL cannot be empty.")

        try:
            parsed_url = urlparse(file_blob_url)
            if not parsed_url.path:
                raise ValueError("Invalid blob URL: Missing path.")

            # Defensive initialization
            container_name = None
            blob_name = None

            # Extract the blob name from the URL
            # First try the expected recordings container
            try:
                recordings_container = self.config.azure_storage_recordings_container
            except BLOB_STREAM_ERRORS:
                recordings_container = None

            if recordings_container and recordings_container in parsed_url.path:
                container_name = recordings_container
                blob_name = parsed_url.path.split(recordings_container, 1)[-1].lstrip("/")
            else:
                # For transcription files or other assets that might be in different containers,
                # try to extract container and blob name from the URL path
                path_parts = parsed_url.path.strip('/').split('/')
                if len(path_parts) >= 2:
                    # Assume format: /container_name/blob_name or /container_name/folder/blob_name
                    container_name = path_parts[0]
                    blob_name = '/'.join(path_parts[1:])
                    self.logger.warning(
                        "blob_stream_container_mismatch",
                        container=container_name,
                        expected_container=recordings_container,
                    )
                else:
                    raise ValueError(f"Blob URL path format not recognized: {parsed_url.path}")

            if not container_name or not blob_name:
                raise ValueError(f"Could not extract container/blob from URL: {file_blob_url}")
            
            if not blob_name:
                raise ValueError("Could not extract blob name from URL")
            self.logger.debug("blob_stream_name_extracted", blob_name=blob_name)

            # Create an async blob client for the resolved container/blob
            async_blob_client = BlobClient(
                account_url=self.config.azure_storage_account_url,
                container_name=container_name,
                blob_name=blob_name,
                credential=self.credential,
            )

            # Stream the blob content in chunks
            try:
                async with async_blob_client:
                    downloader = await async_blob_client.download_blob()
                    # The downloader provides an async iterator of chunks
                    async for chunk in downloader.chunks():
                        yield chunk
            except ResourceNotFoundError:
                self.logger.error("blob_stream_not_found", blob_name=blob_name)
                raise
            except BLOB_STREAM_ERRORS as e:
                self.logger.error(
                    "blob_stream_failed",
                    blob_name=blob_name,
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
                raise

        except ValueError as ve:
            self.logger.warning("blob_stream_validation_failed", error=str(ve))
            raise
        except ResourceNotFoundError as rnfe:
            self.logger.error("blob_stream_not_found", error=str(rnfe))
            raise
        except BLOB_STREAM_ERRORS as e:
            self.logger.error(
                "blob_stream_unexpected_error",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise
