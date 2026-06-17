from typing import Any, Dict
from jose import jwt, JWTError
from app.core.config import AppConfig

class TokenDecodeError(Exception):
    pass

def decode_token(token: str, config: AppConfig) -> Dict[str, Any]:
    """Decode token and return payload. Raises TokenDecodeError on failure."""
    try:
        return jwt.decode(token, config.jwt_secret_key, algorithms=[config.jwt_algorithm])
    except JWTError as e:
        raise TokenDecodeError(str(e)) from e
