import pytest
from pydantic import ValidationError

from app.schemas.uploads import RecordingConsentEvidenceRequest, UploadCompleteRequest


def test_recording_consent_rejects_client_supplied_actor():
    with pytest.raises(ValidationError):
        RecordingConsentEvidenceRequest.model_validate(
            {
                "accepted": True,
                "policy_version": "recording-disclaimer-v1",
                "accepted_at": "2026-09-10T10:00:00Z",
                "accepted_by_user_id": "another-user",
            }
        )


def test_recording_consent_allows_legacy_uploads_to_omit_evidence():
    upload = UploadCompleteRequest.model_validate(
        {
            "blob_url": "https://storage/recordings/file.wav",
            "filename": "file.wav",
        }
    )
    assert upload.recording_consent is None
