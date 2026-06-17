import pytest
from unittest.mock import Mock
from urllib.parse import urlparse

from services.file_processing_service import FileProcessingService


def test_download_blob_full_url_no_sas(file_processing_service, monkeypatch):
    blob_url = "https://testaccount.blob.core.windows.net/recordings/2026/abc/file.txt"

    # Mock blob client stream
    mock_stream = Mock()
    mock_stream.readall = Mock(return_value=b"hello world")
    mock_blob_client = Mock()
    mock_blob_client.download_blob = Mock(return_value=mock_stream)

    # Mock service client factory
    mock_blob_service_client = Mock()
    mock_blob_service_client.get_blob_client = Mock(return_value=mock_blob_client)

    monkeypatch.setattr('services.file_processing_service.BlobServiceClient', Mock(return_value=mock_blob_service_client))

    svc = file_processing_service
    res = svc._download_blob(blob_url, as_text=True)

    assert res == "hello world"
    mock_blob_service_client.get_blob_client.assert_called_once()
    args, kwargs = mock_blob_service_client.get_blob_client.call_args
    assert kwargs.get('container') == 'recordings'
    assert kwargs.get('blob') == '2026/abc/file.txt'


def test_download_blob_relative_path(file_processing_service, monkeypatch):
    blob_url = 'recordings/2026/abc/file.txt'

    mock_stream = Mock()
    mock_stream.readall = Mock(return_value=b"relative content")
    mock_blob_client = Mock()
    mock_blob_client.download_blob = Mock(return_value=mock_stream)

    mock_blob_service_client = Mock()
    mock_blob_service_client.get_blob_client = Mock(return_value=mock_blob_client)

    monkeypatch.setattr('services.file_processing_service.BlobServiceClient', Mock(return_value=mock_blob_service_client))

    svc = file_processing_service
    res = svc._download_blob(blob_url, as_text=True)

    assert res == "relative content"
    mock_blob_service_client.get_blob_client.assert_called_once_with(container='recordings', blob='2026/abc/file.txt')


def test_download_blob_bare_name_uses_default_container(file_processing_service, monkeypatch, app_config):
    blob_url = 'only_file.txt'

    mock_stream = Mock()
    mock_stream.readall = Mock(return_value=b"bare content")
    mock_blob_client = Mock()
    mock_blob_client.download_blob = Mock(return_value=mock_stream)

    mock_blob_service_client = Mock()
    mock_blob_service_client.get_blob_client = Mock(return_value=mock_blob_client)

    monkeypatch.setattr('services.file_processing_service.BlobServiceClient', Mock(return_value=mock_blob_service_client))

    svc = file_processing_service
    res = svc._download_blob(blob_url, as_text=True)

    assert res == "bare content"
    mock_blob_service_client.get_blob_client.assert_called_once_with(container=app_config.storage_recordings_container, blob='only_file.txt')


def test_download_blob_url_with_sas_uses_from_blob_url(file_processing_service, monkeypatch):
    blob_url = 'https://testaccount.blob.core.windows.net/recordings/2026/abc/file.txt?sv=mock'

    mock_stream = Mock()
    mock_stream.readall = Mock(return_value=b"sas content")
    mock_blob_client = Mock()
    mock_blob_client.download_blob = Mock(return_value=mock_stream)

    # Fake BlobClient.from_blob_url to return our mock blob_client
    class FakeBlobClient:
        @classmethod
        def from_blob_url(cls, url):
            assert url == blob_url
            return mock_blob_client

    monkeypatch.setattr('azure.storage.blob.BlobClient', FakeBlobClient)

    svc = file_processing_service
    res = svc._download_blob(blob_url, as_text=True)

    assert res == "sas content"
