"""Resolve authenticated users from supported bearer token types."""
from __future__ import annotations

from typing import Any, Dict, Optional

import jwt
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError

from ...core.config import AppConfig
from ...core.errors.domain import ApplicationError, AuthenticationError, ErrorCode
from ...models.permissions import PermissionLevel
from ...repositories.users import UserRepository
from ...utils.jwt_utils import TokenDecodeError, decode_token
from ...utils.microsoft_token_validator import MicrosoftTokenValidator


class AuthIdentityService:
    """Authenticate bearer tokens and resolve the matching application user."""

    def __init__(
        self,
        *,
        user_repository: UserRepository,
        config: AppConfig,
    ) -> None:
        self.user_repository = user_repository
        self.config = config

    async def resolve_bearer_token(self, token: str) -> Dict[str, Any]:
        algorithm = _token_algorithm(token)
        if algorithm == self.config.jwt_algorithm:
            return await self._resolve_password_token(token)

        if algorithm == "RS256":
            if not self._is_entra_configured():
                raise AuthenticationError("Invalid token: Entra authentication is not configured")
            try:
                claims = self._build_entra_validator().validate_access_token(token)
            except PyJWKClientConnectionError as exc:
                raise ApplicationError(
                    "Microsoft token verification is temporarily unavailable",
                    ErrorCode.SERVICE_UNAVAILABLE,
                    status_code=503,
                ) from exc
            except InvalidTokenError as exc:
                raise AuthenticationError(f"Invalid token: {exc}") from exc
            return await self._resolve_entra_user(claims)

        raise AuthenticationError("Invalid token: unsupported signing algorithm")

    async def _resolve_password_token(self, token: str) -> Dict[str, Any]:
        try:
            payload = decode_token(token, self.config)
            user = await self._resolve_password_user(payload)
            user["auth_source"] = payload.get("auth_source") or "password"
            return user
        except (TokenDecodeError, InvalidTokenError) as exc:
            detail = str(exc) or "Invalid token"
            raise AuthenticationError(f"Invalid token: {detail}") from exc

    async def _resolve_password_user(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        user_id = payload.get("sub")
        user_email = payload.get("email")

        if not user_id and not user_email:
            raise AuthenticationError("Invalid token: missing subject/email")

        lookup_sequence: list[tuple[str, str]] = []
        seen_keys: set[tuple[str, str]] = set()

        def enqueue(kind: str, value: str) -> None:
            key = (kind, value.lower() if kind == "email" else value)
            if key in seen_keys:
                return
            seen_keys.add(key)
            lookup_sequence.append((kind, value))

        if user_id:
            user_id_str = str(user_id)
            enqueue("email" if "@" in user_id_str else "id", user_id_str)
        else:
            user_id_str = None

        if user_email:
            enqueue("email", str(user_email))

        if user_id_str and "@" in user_id_str:
            enqueue("id", user_id_str)

        for lookup_type, value in lookup_sequence:
            user = (
                await self.user_repository.get_by_id(value)
                if lookup_type == "id"
                else await self.user_repository.get_by_email(value)
            )
            if user:
                return self._require_active_user(user)

        raise AuthenticationError("User not found")

    async def _resolve_entra_user(self, claims: Dict[str, Any]) -> Dict[str, Any]:
        tenant_id = str(claims.get("tid") or "")
        object_id = str(claims.get("oid") or claims.get("sub") or "")
        email = claims.get("preferred_username") or claims.get("email") or claims.get("upn") or ""
        email = str(email).lower()

        if not tenant_id or not object_id:
            raise AuthenticationError("Invalid token: missing Entra tenant or object id")

        user = await self.user_repository.get_by_entra_identity(
            tenant_id=tenant_id,
            object_id=object_id,
        )
        if user:
            self._require_active_user(user)

        if not user and email:
            user = await self.user_repository.get_by_email(email)
            if user:
                self._require_active_user(user)
                user = await self.user_repository.update(
                    user["id"],
                    {
                        "microsoft_oid": object_id,
                        "microsoft_tid": tenant_id,
                        "last_login": claims.get("iat"),
                    },
                )

        if not user:
            user = await self.user_repository.create(
                {
                    "id": f"entra_{tenant_id}_{object_id}",
                    "type": "user",
                    "email": email or f"{object_id}@{tenant_id}",
                    "full_name": claims.get("name") or email,
                    "permission": PermissionLevel.USER.value,
                    "is_active": True,
                    "microsoft_oid": object_id,
                    "microsoft_tid": tenant_id,
                    "auth_source": "entra",
                }
            )

        user["auth_source"] = "entra"
        return user

    def _require_active_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        if user.get("is_active") is False:
            raise AuthenticationError("User inactive")
        return user

    def _build_entra_validator(self) -> MicrosoftTokenValidator:
        tenant_id = self._config_string("microsoft_tenant_id")
        app_client_id = self._config_string("microsoft_client_id")
        entra_api_scope = self._config_string("entra_api_scope")
        configured_audience = _scope_audience(entra_api_scope) or app_client_id

        audiences: list[str] = []
        if configured_audience:
            audiences.extend([configured_audience, f"api://{configured_audience}"])
        if app_client_id and app_client_id not in audiences:
            audiences.append(app_client_id)

        scope_name = _scope_name(entra_api_scope)
        required_scopes = [scope_name] if scope_name else []
        allowed_client_ids = [app_client_id] if app_client_id else []

        return MicrosoftTokenValidator(
            tenant_id=tenant_id,
            client_id=configured_audience,
            audiences=audiences,
            required_scopes=required_scopes,
            allowed_client_ids=allowed_client_ids,
            jwks_timeout_seconds=self.config.microsoft_jwks_timeout_seconds,
        )

    def _is_entra_configured(self) -> bool:
        return bool(
            self._config_string("entra_api_scope")
            or self._config_string("microsoft_client_id")
            or self._config_string("microsoft_tenant_id")
        )

    def _config_string(self, name: str) -> Optional[str]:
        value = getattr(self.config, name, None)
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None


def _scope_audience(scope: Optional[str]) -> Optional[str]:
    if not scope or "/" not in scope:
        return None
    return scope.rsplit("/", 1)[0]


def _scope_name(scope: Optional[str]) -> Optional[str]:
    if not scope:
        return None
    if "/" not in scope:
        return scope
    return scope.rsplit("/", 1)[1]


def _token_algorithm(token: str) -> Optional[str]:
    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        raise AuthenticationError(f"Invalid token: {exc}") from exc
    return header.get("alg")
