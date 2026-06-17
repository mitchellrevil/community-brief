import pytest

from config import AppConfig


def test_storage_account_url_trailing_slash_stripped(monkeypatch):
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://example.blob.core.windows.net/")
    monkeypatch.setenv("AZURE_STORAGE_RECORDINGS_CONTAINER", "/recordings/")

    cfg = AppConfig()
    assert cfg.storage_account_url == "https://example.blob.core.windows.net"
    assert cfg.storage_recordings_container == "recordings"
