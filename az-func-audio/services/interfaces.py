"""
Service interfaces for az-func-audio.

Defines Protocol contracts for core services to enable testing and loose coupling.
Uses typing.Protocol to avoid runtime inheritance overhead.
"""

from typing import Protocol, Optional, Any, runtime_checkable
from azure.storage.blob.aio import BlobClient


class BlobStorageService(Protocol):
    """Protocol for blob storage operations."""

    async def download_blob(
        self,
        container_name: str,
        blob_name: str
    ) -> bytes:
        """
        Download blob content as bytes.
        
        Args:
            container_name: Name of the blob container
            blob_name: Name of the blob to download
            
        Returns:
            Blob content as bytes
            
        Raises:
            Exception: If download fails
        """
        ...

    async def upload_blob(
        self,
        container_name: str,
        blob_name: str,
        data: bytes,
        content_type: Optional[str] = None
    ) -> str:
        """
        Upload blob content.
        
        Args:
            container_name: Name of the blob container
            blob_name: Name of the blob to upload
            data: Content to upload
            content_type: Optional MIME type
            
        Returns:
            Blob URL
            
        Raises:
            Exception: If upload fails
        """
        ...

    async def get_blob_client(
        self,
        container_name: str,
        blob_name: str
    ) -> BlobClient:
        """
        Get a blob client for advanced operations.
        
        Args:
            container_name: Name of the blob container
            blob_name: Name of the blob
            
        Returns:
            BlobClient instance
        """
        ...


class TranscriptionService(Protocol):
    """Protocol for audio transcription operations."""

    def submit_transcription_job(
        self,
        audio_url: str,
        file_size_bytes: Optional[int] = None,
        audio_duration_minutes: Optional[float] = None,
    ) -> str:
        """
        Submit audio for transcription.
        
        Args:
            audio_url: URL to audio file (with SAS if needed)
            file_size_bytes: Optional blob size
            audio_duration_minutes: Optional audio duration
            
        Returns:
            Transcription job ID
            
        Raises:
            Exception: If submission fails
        """
        ...

    def check_status(
        self,
        job_id: str,
        timeout: int = 18000,
        interval: int = 5,
    ) -> dict:
        """
        Check transcription job status.
        
        Args:
            job_id: Transcription job ID
            
        Returns:
            Status dict with 'status' key ('NotStarted', 'Running', 'Succeeded', 'Failed')
            
        Raises:
            Exception: If status check fails
        """
        ...

    def get_results(
        self,
        status_data: dict
    ) -> str:
        """
        Retrieve transcription text.
        
        Args:
            status_data: Transcription status payload
            
        Returns:
            Transcribed text
            
        Raises:
            Exception: If retrieval fails or job not complete
        """
        ...


class AnalysisService(Protocol):
    """Protocol for content analysis operations."""

    async def analyze_content(
        self,
        content: str,
        prompt: str,
        system_message: Optional[str] = None
    ) -> str:
        """
        Analyze content using LLM.
        
        Args:
            content: Text content to analyze
            prompt: Analysis prompt/instructions
            system_message: Optional system context
            
        Returns:
            Analysis result text
            
        Raises:
            Exception: If analysis fails
        """
        ...

    async def generate_talking_points(
        self,
        content: str,
        count: int = 5
    ) -> list[str]:
        """
        Generate talking points from content.
        
        Args:
            content: Text content to analyze
            count: Number of talking points to generate
            
        Returns:
            List of talking point strings
            
        Raises:
            Exception: If generation fails
        """
        ...


@runtime_checkable
class AnalysisProvider(Protocol):
    """Protocol for pluggable analysis providers.
    
    Defines the interface for different analysis backends (e.g., Responses API, Chat Completions).
    Providers implement this protocol to enable flexible analysis strategies.
    """

    def analyze(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning: Optional[str],
        verbosity: Optional[str]
    ) -> str:
        """Analyze conversation and return analysis text.
        
        High-level method that orchestrates request building, API call, and response parsing.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis (prompt, instructions, etc.)
            model: Model name to use for analysis
            reasoning: Reasoning effort level ("low", "medium", "high") or None
            verbosity: Verbosity level ("concise", "detailed") or None
            
        Returns:
            Extracted analysis text as string
        """
        ...

    def build_request(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning: Optional[str],
        verbosity: Optional[str]
    ) -> dict:
        """Build an API request payload for the provider.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis (prompt, instructions, etc.)
            model: Model name to use for analysis
            reasoning: Reasoning effort level ("low", "medium", "high") or None
            verbosity: Verbosity level ("concise", "detailed") or None
            
        Returns:
            Provider-specific request payload dict
        """
        ...

    def parse_response(self, response: Any) -> str:
        """Parse the provider's response and extract analysis text.
        
        Args:
            response: Raw API response from the provider
            
        Returns:
            Extracted analysis text
        """
        ...

    def supports_reasoning(self) -> bool:
        """Check if this provider supports reasoning parameters.
        
        Returns:
            True if reasoning.effort is supported, False otherwise
        """
        ...

    def supports_verbosity(self) -> bool:
        """Check if this provider supports verbosity parameters.
        
        Returns:
            True if text.verbosity is supported, False otherwise
        """
        ...
