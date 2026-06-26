"""
In-memory fakes for testing backend services without external dependencies.

These fakes implement the same async interface as the production CosmosService
and StorageService classes, enabling fast, deterministic component tests.

Usage:
    cosmos = InMemoryCosmosFake()
    blob = InMemoryBlobFake()
    job_service = JobService(blob, JobRepository(cosmos))

    # Seed test data
    await cosmos.create_job(job_factory(id="job-1", status="uploaded"))
    
    # Run assertions on behavior
    job = await job_service.get_job("job-1")
    assert job["status"] == "uploaded"
"""

import asyncio
import copy
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, AsyncIterator, Callable
from urllib.parse import urlparse
import logging

from azure.cosmos.exceptions import CosmosResourceNotFoundError

logger = logging.getLogger(__name__)


class InMemoryContainerFake:
    """
    In-memory fake for Cosmos DB container operations.
    
    Supports basic CRUD operations with partition key semantics.
    Thread-safe via asyncio locks for concurrent test scenarios.
    """
    
    def __init__(self, name: str):
        self.name = name
        self._items: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
    
    async def create_item(self, body: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Create a new item in the container."""
        async with self._lock:
            item_id = body.get("id")
            if not item_id:
                raise ValueError("Item must have an 'id' field")
            
            if item_id in self._items:
                raise Exception(f"Item with id '{item_id}' already exists (Conflict)")
            
            # Deep copy to avoid mutation
            stored_item = copy.deepcopy(body)
            self._items[item_id] = stored_item
            return copy.deepcopy(stored_item)
    
    async def read_item(self, item: str, partition_key: str, **kwargs) -> Dict[str, Any]:
        """Read an item by id and partition key."""
        async with self._lock:
            stored = self._items.get(item)
            if stored is None:
                # Mimic CosmosResourceNotFoundError
                raise ResourceNotFoundFakeError(f"Item '{item}' not found")
            return copy.deepcopy(stored)
    
    async def replace_item(self, item: str, body: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Replace an existing item."""
        async with self._lock:
            if item not in self._items:
                raise ResourceNotFoundFakeError(f"Item '{item}' not found for replace")
            
            stored_item = copy.deepcopy(body)
            self._items[item] = stored_item
            return copy.deepcopy(stored_item)
    
    async def upsert_item(self, body: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Upsert (create or replace) an item."""
        async with self._lock:
            item_id = body.get("id")
            if not item_id:
                raise ValueError("Item must have an 'id' field")
            
            stored_item = copy.deepcopy(body)
            self._items[item_id] = stored_item
            return copy.deepcopy(stored_item)
    
    async def delete_item(self, item: str, partition_key: str, **kwargs) -> None:
        """Delete an item by id and partition key."""
        async with self._lock:
            if item not in self._items:
                raise ResourceNotFoundFakeError(f"Item '{item}' not found for delete")
            del self._items[item]
    
    def query_items(
        self, 
        query: str, 
        parameters: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> "AsyncQueryIterator":
        """
        Execute a query against the container.
        
        Note: This is a simplified query implementation that handles basic
        WHERE clauses and parameters. Complex queries may need extension.
        """
        return AsyncQueryIterator(self._items, query, parameters or [])
    
    async def get_all_items(self) -> List[Dict[str, Any]]:
        """Helper method to get all items for testing."""
        async with self._lock:
            return [copy.deepcopy(item) for item in self._items.values()]
    
    async def clear(self) -> None:
        """Clear all items from the container."""
        async with self._lock:
            self._items.clear()


class AsyncQueryIterator:
    """
    Async iterator for query results.
    
    Implements basic query parsing for common patterns:
    - SELECT ... FROM c WHERE c.type = @type
    - SELECT ... FROM c WHERE c.id = @id AND c.user_id = @user_id
    - SELECT VALUE COUNT(1) FROM c WHERE ...
    """
    
    def __init__(
        self, 
        items: Dict[str, Dict[str, Any]], 
        query: str, 
        parameters: List[Dict[str, Any]]
    ):
        self._items = items
        self._query = query.lower()
        self._parameters = {p["name"]: p["value"] for p in parameters}
        self._is_count_query = "count(1)" in self._query.lower()
        self._results: Optional[List[Any]] = None
    
    def _matches_conditions(self, item: Dict[str, Any]) -> bool:
        """Check if an item matches the WHERE conditions."""
        # Extract WHERE clause
        query_lower = self._query
        
        # Parse simple conditions from WHERE clause
        if "where" not in query_lower:
            return True
        
        where_part = query_lower.split("where", 1)[1]
        # Remove ORDER BY, OFFSET, LIMIT if present
        for keyword in ["order by", "offset", "limit"]:
            if keyword in where_part:
                where_part = where_part.split(keyword)[0]
        
        conditions = where_part.strip()
        
        # Handle common patterns
        for param_name, param_value in self._parameters.items():
            # Match patterns like "c.field = @param" or "c.field = @param"
            clean_name = param_name.lstrip("@")
            
            # Check type condition
            if f"c.type = {param_name}" in conditions:
                if item.get("type") != param_value:
                    return False
            
            # Check id condition
            if f"c.id = {param_name}" in conditions:
                if item.get("id") != param_value:
                    return False
            
            # Check user_id condition
            if f"c.user_id = {param_name}" in conditions:
                if item.get("user_id") != param_value:
                    return False
            
            # Check job_id condition
            if f"c.job_id = {param_name}" in conditions:
                if item.get("job_id") != param_value:
                    return False
            
            # Check status condition
            if f"c.status = {param_name}" in conditions:
                if item.get("status") != param_value:
                    return False
            
            # Check email condition (case insensitive)
            if f"lower(c.email) = lower({param_name})" in conditions:
                item_email = (item.get("email") or "").lower()
                if item_email != str(param_value).lower():
                    return False
            
            # Check permission condition
            if f"c.permission = {param_name}" in conditions:
                if item.get("permission") != param_value:
                    return False
        
        # Handle NOT IS_DEFINED(c.deleted) OR c.deleted = false pattern
        if "not is_defined(c.deleted) or c.deleted = false" in conditions:
            if item.get("deleted") is True:
                return False
        
        return True
    
    def _execute_query(self) -> List[Any]:
        """Execute the query and return results."""
        matching = [
            copy.deepcopy(item) 
            for item in self._items.values() 
            if self._matches_conditions(item)
        ]
        
        if self._is_count_query:
            return [len(matching)]
        
        # Handle OFFSET and LIMIT
        offset = self._parameters.get("@offset", 0)
        limit = self._parameters.get("@limit")
        
        if offset:
            matching = matching[int(offset):]
        if limit:
            matching = matching[:int(limit)]
        
        return matching
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        if self._results is None:
            self._results = self._execute_query()
            self._index = 0
        
        if self._index >= len(self._results):
            raise StopAsyncIteration
        
        result = self._results[self._index]
        self._index += 1
        return result


class ResourceNotFoundFakeError(CosmosResourceNotFoundError):
    """Fake not-found exception compatible with production Cosmos handling."""

    def __init__(self, message: str):
        super().__init__(message=message)


class InMemoryCosmosFake:
    """
    In-memory fake for CosmosService.
    
    Provides the same async interface as the production CosmosService class,
    enabling component tests without a real Cosmos DB connection.
    
    Example:
        cosmos = InMemoryCosmosFake()
        await cosmos.create_user(user_factory(id="user-1", email="test@example.com"))
        user = await cosmos.get_user_by_email("test@example.com")
        assert user["id"] == "user-1"
    """
    
    def __init__(self):
        self._containers: Dict[str, InMemoryContainerFake] = {}
        self._initialized = True
        
        # Pre-create common containers
        self._containers["auth"] = InMemoryContainerFake("auth")
        self._containers["jobs"] = InMemoryContainerFake("jobs")
        self._containers["prompts"] = InMemoryContainerFake("prompts")
        self._containers["analytics"] = InMemoryContainerFake("analytics")
        self._containers["user_sessions"] = InMemoryContainerFake("user_sessions")
        self._containers["audit_logs"] = InMemoryContainerFake("audit_logs")
    
    async def initialize(self):
        """Async initialization (no-op for fake, already initialized)."""
        self._initialized = True
    
    async def close(self):
        """Close resources (no-op for fake)."""
        pass
    
    def is_available(self) -> bool:
        """Always available for testing."""
        return True
    
    def get_container(self, container_name: str) -> InMemoryContainerFake:
        """Get or create a container by name."""
        if container_name not in self._containers:
            self._containers[container_name] = InMemoryContainerFake(container_name)
        return self._containers[container_name]
    
    # Container property shortcuts for compatibility
    @property
    def jobs_container(self) -> InMemoryContainerFake:
        return self.get_container("jobs")
    
    @property
    def users_container(self) -> InMemoryContainerFake:
        return self.get_container("auth")
    
    @property
    def sessions_container(self) -> InMemoryContainerFake:
        return self.get_container("user_sessions")
    
    @property
    def audit_container(self) -> InMemoryContainerFake:
        return self.get_container("audit_logs")
    
    # === User methods ===
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID."""
        try:
            container = self.get_container("auth")
            item = await container.read_item(item=user_id, partition_key=user_id)
            if item.get("type") != "user":
                return None
            return item
        except ResourceNotFoundFakeError:
            return None
    
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email (case-insensitive)."""
        container = self.get_container("auth")
        query_iter = container.query_items(
            query="SELECT * FROM c WHERE c.type = @type AND LOWER(c.email) = LOWER(@email)",
            parameters=[
                {"name": "@type", "value": "user"},
                {"name": "@email", "value": email},
            ]
        )
        items = [item async for item in query_iter]
        return items[0] if items else None
    
    async def get_all_users(self, limit: Optional[int] = None, offset: int = 0) -> Dict[str, Any]:
        """Get all users with pagination."""
        container = self.get_container("auth")
        all_items = await container.get_all_items()
        users = [item for item in all_items if item.get("type") == "user"]
        
        total = len(users)
        
        if offset:
            users = users[offset:]
        if limit:
            users = users[:limit]
        
        return {
            "items": users,
            "total": total,
            "limit": limit or total,
            "offset": offset
        }
    
    async def get_all_users_iterator(self) -> AsyncIterator[Dict[str, Any]]:
        """Stream all users."""
        container = self.get_container("auth")
        all_items = await container.get_all_items()
        for item in all_items:
            if item.get("type") == "user":
                yield item
    
    async def create_user(self, user_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new user."""
        container = self.get_container("auth")
        return await container.create_item(body=user_doc)
    
    async def update_user(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing user."""
        existing = await self.get_user_by_id(user_id)
        if not existing:
            raise ValueError(f"User with id {user_id} not found")
        
        existing.update(updates)
        container = self.get_container("auth")
        return await container.replace_item(item=user_id, body=existing)
    
    async def delete_user(self, user_id: str) -> bool:
        """Delete a user by ID."""
        try:
            container = self.get_container("auth")
            await container.delete_item(item=user_id, partition_key=user_id)
            return True
        except ResourceNotFoundFakeError:
            return False
    
    async def get_user_permission(self, user_id: str) -> Optional[str]:
        """Get user permission level."""
        user = await self.get_user_by_id(user_id)
        return user.get("permission") if user else None
    
    async def get_users_by_permission(
        self, 
        permission: str, 
        *, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get users by permission level."""
        container = self.get_container("auth")
        query_iter = container.query_items(
            query="SELECT * FROM c WHERE c.type = @type AND c.permission = @permission",
            parameters=[
                {"name": "@type", "value": "user"},
                {"name": "@permission", "value": permission},
            ]
        )
        users = [item async for item in query_iter]
        if limit:
            users = users[:limit]
        return users
    
    # === Job methods ===
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID."""
        try:
            container = self.get_container("jobs")
            item = await container.read_item(item=job_id, partition_key=job_id)
            if item.get("type") != "job":
                return None
            return item
        except ResourceNotFoundFakeError:
            return None
    
    async def get_job_by_id_async(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Alias for get_job."""
        return await self.get_job(job_id)
    
    async def create_job(self, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new job."""
        container = self.get_container("jobs")
        return await container.create_item(body=job_doc)
    
    async def update_job(self, job_id: str, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing job."""
        container = self.get_container("jobs")
        return await container.replace_item(item=job_id, body=job_doc)
    
    async def update_job_async(self, job_id: str, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for update_job."""
        return await self.update_job(job_id, job_doc)
    
    # === Helper methods for testing ===
    
    async def clear_all(self) -> None:
        """Clear all data from all containers."""
        for container in self._containers.values():
            await container.clear()
    
    async def seed_data(
        self, 
        users: Optional[List[Dict[str, Any]]] = None,
        jobs: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Seed test data into containers."""
        if users:
            for user in users:
                await self.create_user(user)
        if jobs:
            for job in jobs:
                await self.create_job(job)


class InMemoryBlobFake:
    """
    In-memory fake for StorageService (Azure Blob Storage).
    
    Provides the same async interface as the production StorageService class,
    enabling component tests without Azure Storage access.
    
    Example:
        blob = InMemoryBlobFake()
        url = await blob.upload_file("/path/to/file.wav", "recording.wav")
        content = await blob.download_text_from_blob(url)
    """
    
    def __init__(self, base_url: str = "https://fakeaccount.blob.core.windows.net"):
        self.base_url = base_url
        self.container_name = "uploads"
        self._blobs: Dict[str, bytes] = {}
        self._lock = asyncio.Lock()
        self.logger = logging.getLogger(__name__)
    
    async def close(self):
        """Close resources (no-op for fake)."""
        pass
    
    async def upload_file(self, file_path: str, original_filename: str) -> str:
        """
        Upload a file to blob storage.
        
        For testing, reads file content if path exists, otherwise creates mock content.
        Returns the blob URL.
        """
        async with self._lock:
            # Sanitize filename
            sanitized_filename = original_filename.replace(" ", "_")
            
            # Generate blob name with date structure
            current_date = datetime.now().strftime("%Y-%m-%d")
            timestamp = datetime.now().strftime("%H%M%S_%f")[:-3]
            file_name_without_ext = sanitized_filename.rsplit(".", 1)[0] if "." in sanitized_filename else sanitized_filename
            blob_name = f"{current_date}/{file_name_without_ext}_{timestamp}/{sanitized_filename}"
            
            # Try to read actual file content, or use mock content
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
            except (FileNotFoundError, IOError):
                # Mock content for testing when file doesn't exist
                content = b"mock_audio_content_for_testing"
            
            self._blobs[blob_name] = content
            
            return f"{self.base_url}/{self.container_name}/{blob_name}"
    
    async def generate_sas_token(self, blob_url: str) -> Optional[str]:
        """Generate a mock SAS token for a blob URL."""
        if not blob_url:
            return None
        return "sv=2021-06-08&st=2024-01-01T00:00:00Z&se=2024-12-31T23:59:59Z&sr=b&sp=r&sig=mocksignature"
    
    async def add_sas_token_to_url(self, blob_url: str) -> str:
        """Add mock SAS token to blob URL."""
        if not blob_url:
            return blob_url
        
        if "?" in blob_url:
            return blob_url
        
        sas_token = await self.generate_sas_token(blob_url)
        if sas_token:
            return f"{blob_url}?{sas_token}"
        return blob_url
    
    async def download_text_from_blob(self, blob_url: str) -> Optional[str]:
        """Download text content from a blob URL."""
        if not blob_url:
            return None
        
        blob_name = self._extract_blob_name(blob_url)
        if not blob_name:
            return None
        
        async with self._lock:
            content = self._blobs.get(blob_name)
            if content is None:
                return None
            
            try:
                return content.decode("utf-8")
            except UnicodeDecodeError:
                return None
    
    async def download_docx_text_from_blob(self, blob_url: str) -> Optional[str]:
        """Download and extract text from a .docx blob (mocked for testing)."""
        if not blob_url:
            return None
        
        blob_name = self._extract_blob_name(blob_url)
        if not blob_name:
            return None
        
        # For testing, return mock extracted text
        return f"Mock extracted text from {blob_name}"

    async def download_blob_bytes(self, blob_url: str) -> bytes:
        """Download raw blob content."""
        blob_name = self._extract_blob_name(blob_url)
        if not blob_name:
            raise ValueError(f"Invalid blob URL: {blob_url}")

        async with self._lock:
            content = self._blobs.get(blob_name)
            if content is None:
                raise FileNotFoundError(f"Blob not found: {blob_url}")
            return content

    async def generate_docx_bytes(self, analysis_text: str, add_title: bool = True) -> bytes:
        """Generate mock DOCX bytes for tests."""
        return f"MOCK_DOCX_CONTENT: {analysis_text}".encode("utf-8")
    
    async def generate_and_upload_docx(
        self, 
        analysis_text: str, 
        blob_name: str, 
        add_title: bool = True
    ) -> str:
        """Generate a mock DOCX and upload to blob storage."""
        async with self._lock:
            # Store mock DOCX content
            mock_content = f"MOCK_DOCX_CONTENT: {analysis_text}".encode("utf-8")
            self._blobs[blob_name] = mock_content
            return f"{self.base_url}/{self.container_name}/{blob_name}"
    
    async def stream_blob_content(self, file_blob_url: str):
        """Stream content from a blob asynchronously."""
        if not file_blob_url:
            raise ValueError("Blob URL cannot be empty.")
        
        blob_name = self._extract_blob_name(file_blob_url)
        if not blob_name:
            raise ValueError(f"Invalid blob URL: {file_blob_url}")
        
        async with self._lock:
            content = self._blobs.get(blob_name)
            if content is None:
                raise Exception(f"Blob not found: {blob_name}")
        
        # Yield content in chunks
        chunk_size = 4096
        for i in range(0, len(content), chunk_size):
            yield content[i:i + chunk_size]
    
    def _extract_blob_name(self, blob_url: str) -> Optional[str]:
        """Extract blob name from URL."""
        if not blob_url:
            return None
        
        # Remove query parameters (SAS token)
        url_without_query = blob_url.split("?")[0]
        
        parsed = urlparse(url_without_query)
        path_parts = parsed.path.strip("/").split("/")
        
        if len(path_parts) < 2:
            return None
        
        # Skip container name and join the rest
        return "/".join(path_parts[1:])
    
    # === Helper methods for testing ===
    
    async def set_blob_content(self, blob_name: str, content: bytes) -> str:
        """Directly set blob content for testing."""
        async with self._lock:
            self._blobs[blob_name] = content
            return f"{self.base_url}/{self.container_name}/{blob_name}"
    
    async def get_blob_content(self, blob_name: str) -> Optional[bytes]:
        """Get blob content for testing assertions."""
        async with self._lock:
            return self._blobs.get(blob_name)
    
    async def clear_all(self) -> None:
        """Clear all blobs."""
        async with self._lock:
            self._blobs.clear()
    
    async def list_blobs(self) -> List[str]:
        """List all blob names."""
        async with self._lock:
            return list(self._blobs.keys())
