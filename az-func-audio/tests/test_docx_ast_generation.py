import io
from typing import Any

import pytest

from services.storage_service import StorageService, StorageServiceError


class DummyConfig:
    storage_account_url = "https://example.blob.core.windows.net/"
    storage_recordings_container = "recordings"


class MockBlobClient:
    def __init__(self, url: str):
        self.url = url
        self.uploaded_bytes: bytes | None = None

    def upload_blob(self, data: bytes, overwrite: bool = True) -> None:
        # Allow both bytes and BytesIO
        if hasattr(data, 'read'):
            self.uploaded_bytes = data.read()
        else:
            self.uploaded_bytes = data


class MockContainerClient:
    def __init__(self, container_name: str):
        self.container_name = container_name
        self.last_blob_client: MockBlobClient | None = None

    def get_blob_client(self, blob_name: str) -> MockBlobClient:
        self.last_blob_client = MockBlobClient(url=blob_name)
        return self.last_blob_client


class MockBlobServiceClient:
    def __init__(self):
        self.last_container_client: MockContainerClient | None = None

    def get_container_client(self, container_name: str) -> MockContainerClient:
        self.last_container_client = MockContainerClient(container_name)
        return self.last_container_client


def test_generate_docx_with_markdown_ast():
    md = (
        "# Title\n\n"
        "Intro paragraph with **bold**, *italic*, and `code`.\n\n"
        "## Section\n\n"
        "1. First item\n"
        "2. Second item with **strong**\n\n"
        "- Bullet A\n"
        "  - Nested bullet\n\n"
        "```\n"
        "fenced code block\n"
        "```\n"
    )

    mock_blob_service = MockBlobServiceClient()
    svc = StorageService(config=DummyConfig(), credential=None, blob_service_client=mock_blob_service)

    url = svc.generate_and_upload_docx(md, blob_url="docs/test.docx")

    assert url == "docs/test.docx"
    assert mock_blob_service.last_container_client is not None
    assert mock_blob_service.last_container_client.last_blob_client is not None
    uploaded = mock_blob_service.last_container_client.last_blob_client.uploaded_bytes
    assert uploaded is not None and len(uploaded) > 1024

    # Inspect resulting DOCX paragraphs and styles
    from docx import Document
    doc = Document(io.BytesIO(uploaded))
    styles = [p.style.name for p in doc.paragraphs]

    # Heading styles
    assert any(s.startswith("Heading") for s in styles)

    # List styles present
    assert "List Number" in styles or any(s.startswith("List Number") for s in styles)
    assert "List Bullet" in styles or any(s.startswith("List Bullet") for s in styles)

