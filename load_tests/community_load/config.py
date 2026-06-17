from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


DEFAULT_HOST = "http://localhost:8000"
REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_env_files() -> str | None:
    raw_token: str | None = None
    for path in (
        REPO_ROOT / "backend_app" / ".env",
        REPO_ROOT / "frontend_app" / ".env",
        REPO_ROOT / "scripts" / ".env",
    ):
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
        if text and "=" not in text and "\n" not in text:
            raw_token = text
            continue
        load_dotenv(path, override=False)
    return raw_token


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _csv_env(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class LoadTestConfig:
    host: str
    openapi_url: str
    auth_token: str | None
    auth_email: str | None
    auth_password: str | None
    enable_writes: bool
    enable_admin_writes: bool
    run_id: str
    endpoint_sample_limit: int
    allowed_write_flows: tuple[str, ...]


def load_config() -> LoadTestConfig:
    raw_token = _load_env_files()
    host = (
        os.getenv("COMMUNITY_API_HOST")
        or os.getenv("LOAD_TEST_API_HOST")
        or DEFAULT_HOST
    ).rstrip("/")
    if host.endswith("/api") or host.endswith("/api/v1"):
        host = host.removesuffix("/v1").removesuffix("/api")

    token = (
        os.getenv("COMMUNITY_AUTH_TOKEN")
        or os.getenv("LOAD_TEST_AUTH_TOKEN")
        or os.getenv("API_AUTH_TOKEN")
        or os.getenv("AUTH_TOKEN")
        or raw_token
    )
    if token and token.strip().lower().startswith("bearer "):
        token = token.strip()[7:]

    return LoadTestConfig(
        host=host,
        openapi_url=os.getenv("COMMUNITY_OPENAPI_URL", f"{host}/openapi.json"),
        auth_token=token.strip() if token else None,
        auth_email=os.getenv("COMMUNITY_AUTH_EMAIL") or os.getenv("E2E_USER_EMAIL"),
        auth_password=os.getenv("COMMUNITY_AUTH_PASSWORD") or os.getenv("E2E_USER_PASSWORD"),
        enable_writes=_bool_env("COMMUNITY_ENABLE_WRITES", True),
        enable_admin_writes=_bool_env("COMMUNITY_ENABLE_ADMIN_WRITES", True),
        run_id=os.getenv("COMMUNITY_LOAD_RUN_ID", uuid.uuid4().hex[:10]),
        endpoint_sample_limit=int(os.getenv("COMMUNITY_ENDPOINT_SAMPLE_LIMIT", "6")),
        allowed_write_flows=tuple(_csv_env("COMMUNITY_ALLOWED_WRITE_FLOWS", "prompts,announcements,jobs,upload")),
    )


CONFIG = load_config()
