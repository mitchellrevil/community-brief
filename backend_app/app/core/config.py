"""
Simplified, consolidated configuration system.
Replaces both the old config.py AppConfig singleton and settings.py complexity.
"""
from typing import Dict, List, Optional

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings

from pydantic import Field, AliasChoices, field_validator


class DatabaseError(Exception):
    """Custom exception for database-related errors"""
    pass


class AppConfig(BaseSettings):
    """
    Single source of truth for all application configuration.
    Eliminates the config.py/settings.py duplication and singleton patterns.
    """
    
    model_config = {
        "extra": "allow",
        "env_file": ".env", 
        "case_sensitive": False,
        "populate_by_name": True,
    }
    
    # Environment
    environment: str = Field("development", validation_alias=AliasChoices("ENVIRONMENT"))
    debug: bool = Field(False, validation_alias=AliasChoices("DEBUG"))
    app_name: str = Field("Community Brief API", validation_alias=AliasChoices("APP_NAME"))
    app_version: str = Field("1.0.0", validation_alias=AliasChoices("APP_VERSION"))
    
    # Cosmos DB (temporary optional for minimal server testing)
    cosmos_endpoint: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("AZURE_COSMOS_ENDPOINT"),
    )
    cosmos_key: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("AZURE_COSMOS_KEY"),
    )
    cosmos_database: str = Field(
        "VoiceDB",
        validation_alias=AliasChoices("AZURE_COSMOS_DB"),
    )
    cosmos_prefix: str = Field(
        "voice_",
        validation_alias=AliasChoices("AZURE_COSMOS_DB_PREFIX"),
    )
    
    # Authentication
    jwt_secret_key: str = Field(..., validation_alias=AliasChoices("JWT_SECRET_KEY"))
    jwt_algorithm: str = Field("HS256", validation_alias=AliasChoices("JWT_ALGORITHM"))
    jwt_access_token_expire_minutes: int = Field(60, validation_alias=AliasChoices("JWT_ACCESS_TOKEN_EXPIRE_MINUTES"))
    jwt_refresh_token_expire_days: int = Field(7, validation_alias=AliasChoices("JWT_REFRESH_TOKEN_EXPIRE_DAYS"))
    auth_cookie_secure: bool = Field(False, validation_alias=AliasChoices("AUTH_COOKIE_SECURE"))
    auth_cookie_samesite: str = Field("Lax", validation_alias=AliasChoices("AUTH_COOKIE_SAMESITE"))
    auth_cookie_domain: Optional[str] = Field(None, validation_alias=AliasChoices("AUTH_COOKIE_DOMAIN"))
    
    # Microsoft Entra authentication
    microsoft_client_id: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("VITE_CLIENT_ID"),
    )
    microsoft_tenant_id: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("VITE_TENANT_ID"),
    )
    microsoft_jwks_timeout_seconds: float = Field(
        5.0,
        validation_alias=AliasChoices("MICROSOFT_JWKS_TIMEOUT_SECONDS"),
    )
    entra_api_scope: Optional[str] = Field(None, validation_alias=AliasChoices("VITE_ENTRA_API_SCOPE"))
    password_login_enabled: bool = Field(
        True,
        validation_alias=AliasChoices("PASSWORD_LOGIN_ENABLED"),
    )
    
    # Azure Storage
    azure_storage_account_url: str = Field(..., validation_alias=AliasChoices("AZURE_STORAGE_ACCOUNT_URL"))
    azure_storage_key: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_STORAGE_KEY"))
    azure_storage_recordings_container: str = Field("uploads", validation_alias=AliasChoices("AZURE_STORAGE_RECORDINGS_CONTAINER"))
    
    # Azure OpenAI
    azure_openai_endpoint: str = Field(..., validation_alias=AliasChoices("AZURE_OPENAI_ENDPOINT"))
    azure_openai_key: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_OPENAI_KEY"))
    azure_openai_deployment: str = Field("gpt-4", validation_alias=AliasChoices("AZURE_OPENAI_DEPLOYMENT"))
    azure_openai_deployment_name: str = Field("gpt-4", validation_alias=AliasChoices("AZURE_OPENAI_DEPLOYMENT_NAME"))
    azure_openai_api_version: str = Field("2024-12-01-preview", validation_alias=AliasChoices("AZURE_OPENAI_API_VERSION"))

    # Azure Speech Service
    azure_speech_key: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_SPEECH_KEY"))
    azure_speech_region: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_SPEECH_REGION"))
    
    # Azure Functions
    azure_functions_base_url: str = Field("http://localhost:7071", validation_alias=AliasChoices("AZURE_FUNCTIONS_BASE_URL"))
    azure_functions_key: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_FUNCTIONS_KEY"))

    # Azure managed identity hints used by Azure SDK default credentials.
    azure_client_id: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_CLIENT_ID"))
    azure_tenant_id: Optional[str] = Field(None, validation_alias=AliasChoices("AZURE_TENANT_ID"))
    azure_msi_endpoint: Optional[str] = Field(None, validation_alias=AliasChoices("MSI_ENDPOINT"))
    azure_identity_endpoint: Optional[str] = Field(None, validation_alias=AliasChoices("IDENTITY_ENDPOINT"))
    managed_identity_client_id: Optional[str] = Field(None, validation_alias=AliasChoices("MANAGED_IDENTITY_CLIENT_ID"))
    
    # CORS - SECURITY: Set CORS_ORIGINS to your frontend domain(s) in production
    # Example: "https://your-frontend.azurewebsites.net,https://custom-domain.com"
    # DO NOT use "*" in production - it allows any website to make authenticated requests
    # Default allows localhost for development - set CORS_ORIGINS env var for production
    frontend_url: Optional[str] = Field(None, validation_alias=AliasChoices("FRONTEND_URL"))
    cors_origins: str = Field(
        "http://localhost:3000",
        validation_alias=AliasChoices("CORS_ORIGINS")
    )
    cors_allow_credentials: bool = Field(True, validation_alias=AliasChoices("CORS_ALLOW_CREDENTIALS"))
    
    # File Processing
    max_upload_size_mb: int = Field(500, validation_alias=AliasChoices("MAX_UPLOAD_SIZE_MB"))
    # Security middleware (IP-based rate limiting). Keep conservative defaults, but allow
    # overriding for local dev / E2E runs.
    security_max_requests_per_minute: int = Field(60, validation_alias=AliasChoices("SECURITY_MAX_REQUESTS_PER_MINUTE"))
    allowed_file_types: List[str] = Field(
        ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4", "audio/webm"],
        validation_alias=AliasChoices("ALLOWED_FILE_TYPES")
    )

    # Caching
    redis_url: Optional[str] = Field(None, validation_alias=AliasChoices("REDIS_URL"))
    cache_type: str = Field("memory", validation_alias=AliasChoices("CACHE_TYPE"))
    cache_key_prefix: str = Field("community_brief:permission:", validation_alias=AliasChoices("CACHE_KEY_PREFIX"))
    cache_ttl: int = Field(300, validation_alias=AliasChoices("CACHE_TTL"))

    @field_validator("debug", mode="before")
    @classmethod
    def _parse_debug_flag(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production", "false", "0", "off", "no"}:
                return False
            if normalized in {"debug", "development", "dev", "true", "1", "on", "yes"}:
                return True
        return value

    @property
    def cache(self):
        from types import SimpleNamespace
        return SimpleNamespace(
            cache_type=self.cache_type,
            redis_url=self.redis_url,
            key_prefix=self.cache_key_prefix,
            default_ttl=self.cache_ttl
        )

    @property
    def cosmos_containers(self) -> Dict[str, str]:
        """Get all cosmos container names with prefix"""
        return {
            "auth": f"{self.cosmos_prefix}auth",
            "jobs": f"{self.cosmos_prefix}jobs",
            "prompts": f"{self.cosmos_prefix}prompts",
            "analytics": f"{self.cosmos_prefix}analytics",
            "user_sessions": f"{self.cosmos_prefix}user_sessions",
            "audit_logs": f"{self.cosmos_prefix}audit_logs",
        }
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def allowed_file_types_list(self) -> List[str]:
        """Parse allowed file types from comma-separated string"""
        # Allow configuration to be a list or a comma-separated string
        if isinstance(self.allowed_file_types, (list, tuple)):
            return list(self.allowed_file_types)
        return [ext.strip() for ext in str(self.allowed_file_types).split(",")]

    @property
    def has_cosmos_managed_identity_hint(self) -> bool:
        """Return whether runtime configuration points to managed identity auth."""
        return any(
            (
                self.azure_client_id,
                self.azure_tenant_id,
                self.azure_msi_endpoint,
                self.azure_identity_endpoint,
                self.managed_identity_client_id,
            )
        )

