import pytest

from backend_app.app.core.errors.storage import (
    BlobNotFoundError,
    BlobUploadError,
    BlobDownloadError,
    BlobDeleteError,
    SASTokenError,
    ContainerNotFoundError,
    StorageAuthenticationError,
    StoragePermissionError,
    StorageQuotaExceededError,
    BlobTooLargeError,
)
from backend_app.app.core.errors.domain import ErrorCode


def test_blob_not_found_and_status():
    exc = BlobNotFoundError(blob_name="b1", container="c1")
    assert exc.status_code == 404
    assert exc.error_code == ErrorCode.RESOURCE_NOT_FOUND


def test_blob_upload_download_delete_errors():
    u = BlobUploadError(blob_name="b2", reason="net")
    d = BlobDownloadError(blob_name="b3", reason="net")
    r = BlobDeleteError(blob_name="b4", reason="perm")

    assert u.status_code == 500 and d.status_code == 500 and r.status_code == 500


def test_sas_token_error_sanitizes_url():
    exc = SASTokenError(reason="invalid", blob_url="https://host/container/blob?sig=token")
    assert "SAS token error" in str(exc)
    assert exc.details.get("blob_url") == "https://host/container/blob"


def test_container_not_found_and_auth_permission():
    c = ContainerNotFoundError(container_name="c1")
    assert c.status_code == 404

    auth = StorageAuthenticationError(reason="no creds")
    assert auth.status_code == 401

    perm = StoragePermissionError(operation="write", resource="r1")
    assert perm.status_code == 403 and perm.error_code == ErrorCode.FORBIDDEN


def test_quota_and_blob_too_large():
    q = StorageQuotaExceededError(quota_type="space", current_value=5, limit=1)
    assert q.status_code == 429 and q.error_code == ErrorCode.QUOTA_EXCEEDED

    too = BlobTooLargeError(blob_name="big", size_bytes=5 * 1024 * 1024, max_size_bytes=1 * 1024 * 1024)
    assert too.status_code == 413 and too.error_code == ErrorCode.INVALID_INPUT
