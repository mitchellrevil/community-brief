"""Security primitives shared across auth and user-management flows."""

from passlib.context import CryptContext
from passlib.exc import InternalBackendError, MissingBackendError, PasslibSecurityError

from .logging import get_logger

logger = get_logger(__name__)

pwd_context = CryptContext(schemes=["argon2", "pbkdf2_sha256"], deprecated="auto")
HASH_BACKEND_ERRORS = (InternalBackendError, MissingBackendError, PasslibSecurityError)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    if password is None:
        raise ValueError("Password required for hashing")
    return _hash_with_fallback(password)


def _hash_with_fallback(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except HASH_BACKEND_ERRORS as exc:
        logger.warning("primary_password_hash_failed", error=str(exc), fallback="pbkdf2_sha256")
        fallback_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
        return fallback_context.hash(password)
