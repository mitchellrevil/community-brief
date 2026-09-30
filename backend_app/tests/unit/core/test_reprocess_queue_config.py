from app.core.config import AppConfig


def test_queue_endpoint_defaults_to_storage_account_derivation(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.delenv("AZURE_STORAGE_QUEUE_ACCOUNT_URL", raising=False)

    cfg = AppConfig(_env_file=None)

    assert cfg.jwt_secret_key == "test-jwt-secret"
    assert cfg.azure_storage_queue_account_url is None


def test_cosmos_containers_maps_analytics_to_voice_analytics(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")

    cfg = AppConfig(_env_file=None)

    assert cfg.cosmos_containers["analytics"] == "voice_analytics"


def test_cosmos_managed_identity_hint_uses_central_config(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.setenv("AZURE_CLIENT_ID", "client-id")

    cfg = AppConfig(_env_file=None)

    assert cfg.has_cosmos_managed_identity_hint is True


def test_agent_chat_defaults_to_luna(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.delenv("AZURE_OPENAI_DEPLOYMENT_NAME", raising=False)

    cfg = AppConfig(_env_file=None)

    assert cfg.azure_openai_deployment_name == "gpt-5.6-luna"
