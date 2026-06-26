import pytest

from config import AppConfig


def test_storage_account_url_trailing_slash_stripped(monkeypatch):
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://example.blob.core.windows.net/")
    monkeypatch.setenv("AZURE_STORAGE_RECORDINGS_CONTAINER", "/recordings/")

    cfg = AppConfig()
    assert cfg.storage_account_url == "https://example.blob.core.windows.net"
    assert cfg.storage_recordings_container == "recordings"


def test_cosmos_key_is_read_from_env(monkeypatch):
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://example.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_COSMOS_KEY", "test-cosmos-key")

    cfg = AppConfig()
    assert cfg.cosmos_key == "test-cosmos-key"


def test_storage_account_key_falls_back_to_azure_webjobs_storage(monkeypatch):
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://example.documents.azure.com:443/")
    monkeypatch.delenv("AZURE_STORAGE_ACCOUNT_KEY", raising=False)
    monkeypatch.setenv(
        "AzureWebJobsStorage",
        "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=from-connection-string",
    )

    cfg = AppConfig()
    assert cfg.storage_account_key == "from-connection-string"


def test_speech_key_is_read_from_env(monkeypatch):
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://example.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_SPEECH_KEY", "test-speech-key")

    cfg = AppConfig()
    assert cfg.speech_key == "test-speech-key"


def test_openai_key_accepts_backend_alias(monkeypatch):
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://example.documents.azure.com:443/")
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AZURE_OPENAI_KEY", "test-openai-key")

    cfg = AppConfig()
    assert cfg.azure_openai_api_key == "test-openai-key"
