from __future__ import annotations

from typing import Any

from locust.clients import HttpSession

from .config import CONFIG


def _extract_access_token(payload: dict[str, Any]) -> str | None:
    for key in ("access_token", "token", "jwt"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_access_token(data)
    return None


def authenticate(client: HttpSession) -> dict[str, Any] | None:
    if CONFIG.auth_token:
        client.headers.update({"Authorization": f"Bearer {CONFIG.auth_token}"})
        return current_user(client)

    if not CONFIG.auth_email or not CONFIG.auth_password:
        return None

    response = client.post(
        "/api/v1/auth/login",
        json={"email": CONFIG.auth_email, "password": CONFIG.auth_password},
        name="POST /api/v1/auth/login",
        catch_response=True,
    )
    with response:
        if response.status_code >= 400:
            response.failure(f"login failed: HTTP {response.status_code}")
            return None
        token = _extract_access_token(response.json())
        if not token:
            response.failure("login response did not contain an access token")
            return None
        client.headers.update({"Authorization": f"Bearer {token}"})
        response.success()
    return current_user(client)


def current_user(client: HttpSession) -> dict[str, Any] | None:
    response = client.get("/api/v1/auth/me", name="GET /api/v1/auth/me", catch_response=True)
    with response:
        if response.status_code >= 400:
            response.failure(f"auth probe failed: HTTP {response.status_code}")
            return None
        payload = response.json()
        response.success()
    data = payload.get("data") if isinstance(payload, dict) else None
    return data if isinstance(data, dict) else payload

