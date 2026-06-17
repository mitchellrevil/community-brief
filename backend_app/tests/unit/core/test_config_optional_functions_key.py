from app.core.config import AppConfig


def test_app_config_without_functions_key(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.delenv("AZURE_FUNCTIONS_KEY", raising=False)

    cfg = AppConfig(_env_file=None)

    assert cfg.jwt_secret_key == "test-jwt-secret"
    assert cfg.azure_functions_key is None


def test_cosmos_containers_maps_analytics_to_voice_analytics(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.delenv("AZURE_FUNCTIONS_KEY", raising=False)

    cfg = AppConfig(_env_file=None)

    assert cfg.cosmos_containers["analytics"] == "voice_analytics"


def test_cosmos_managed_identity_hint_uses_central_config(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://fake.blob.core.windows.net")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test-openai.openai.azure.com")
    monkeypatch.setenv("AZURE_CLIENT_ID", "client-id")

    cfg = AppConfig(_env_file=None)

    assert cfg.has_cosmos_managed_identity_hint is True
