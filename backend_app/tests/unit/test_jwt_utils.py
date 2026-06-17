"""
Unit tests for JWT utilities.

These are pure function tests - no I/O, no external dependencies.
Each test should run in milliseconds.

Test pattern: Given/When/Then naming for clarity.
"""

import pytest
from datetime import datetime, timedelta, timezone
from freezegun import freeze_time
from unittest.mock import MagicMock


# ============================================================================
# TEST: decode_token
# ============================================================================

class TestDecodeToken:
    """Tests for decode_token function."""
    
    @pytest.fixture
    def mock_config(self):
        config = MagicMock()
        config.jwt_secret_key = "test-secret-key-for-unit-tests"
        config.jwt_algorithm = "HS256"
        config.jwt_access_token_expire_minutes = 60
        return config
    
    def test_decodes_valid_token(self, mock_config):
        """Given a valid token, when decoding, then returns payload."""
        from app.utils.jwt_utils import decode_token
        from jose import jwt

        token = jwt.encode(
            {
                "sub": "user-123",
                "email": "test@example.com",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            mock_config.jwt_secret_key,
            algorithm=mock_config.jwt_algorithm,
        )
        
        payload = decode_token(token, mock_config)
        
        assert payload["sub"] == "user-123"
        assert payload["email"] == "test@example.com"
    
    def test_raises_error_for_invalid_token(self, mock_config):
        """Given an invalid token, when decoding, then raises TokenDecodeError."""
        from app.utils.jwt_utils import decode_token, TokenDecodeError
        
        invalid_token = "not.a.valid.token"
        
        with pytest.raises(TokenDecodeError):
            decode_token(invalid_token, mock_config)
    
    def test_raises_error_for_wrong_secret(self, mock_config):
        """Given a token signed with different secret, when decoding, then raises error."""
        from app.utils.jwt_utils import decode_token, TokenDecodeError
        from jose import jwt
        
        # Create token with different secret
        wrong_secret_token = jwt.encode(
            {"sub": "user-1", "email": "test@example.com", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm="HS256"
        )
        
        with pytest.raises(TokenDecodeError):
            decode_token(wrong_secret_token, mock_config)
    
    @freeze_time("2024-01-15 14:00:00")
    def test_raises_error_for_expired_token(self, mock_config):
        """Given an expired token, when decoding, then raises TokenDecodeError."""
        from app.utils.jwt_utils import decode_token, TokenDecodeError
        from jose import jwt
        
        # Create already-expired token
        expired_token = jwt.encode(
            {
                "sub": "user-1",
                "email": "test@example.com",
                "exp": datetime(2024, 1, 15, 13, 0, 0, tzinfo=timezone.utc),  # 1 hour ago
            },
            mock_config.jwt_secret_key,
            algorithm="HS256"
        )
        
        with pytest.raises(TokenDecodeError):
            decode_token(expired_token, mock_config)


