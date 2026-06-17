from unittest.mock import MagicMock, patch

import pytest
from jwt.exceptions import PyJWKClientConnectionError

from app.utils.microsoft_token_validator import MicrosoftTokenValidator


def test_validator_configures_jwks_timeout() -> None:
    with patch("app.utils.microsoft_token_validator.PyJWKClient") as mock_jwk_client:
        MicrosoftTokenValidator(
            tenant_id="tenant-id",
            client_id="client-id",
            jwks_timeout_seconds=7.5,
        )

    mock_jwk_client.assert_called_once_with(
        MicrosoftTokenValidator.JWKS_URI,
        cache_keys=True,
        max_cached_keys=16,
        cache_jwk_set=True,
        lifespan=3600,
        timeout=7.5,
    )


def test_validate_id_token_reraises_jwks_connection_error() -> None:
    with patch("app.utils.microsoft_token_validator.PyJWKClient") as mock_jwk_client:
        mock_instance = MagicMock()
        mock_instance.get_signing_key_from_jwt.side_effect = PyJWKClientConnectionError(
            "timed out"
        )
        mock_jwk_client.return_value = mock_instance

        validator = MicrosoftTokenValidator(
            tenant_id="tenant-id",
            client_id="client-id",
        )

    with pytest.raises(PyJWKClientConnectionError):
        validator.validate_id_token("header.payload.signature")