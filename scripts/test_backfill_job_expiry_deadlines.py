from datetime import UTC, datetime, timedelta
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_script_path = Path(__file__).with_name("backfill_job_expiry_deadlines.py")
_spec = spec_from_file_location("backfill_job_expiry_deadlines", _script_path)
assert _spec and _spec.loader
_module = module_from_spec(_spec)
_spec.loader.exec_module(_module)


def test_apply_expiry_deadline_uses_original_creation_time():
    created_at = datetime(2026, 7, 1, 12, tzinfo=UTC)
    job = {"id": "job-1", "created_at": created_at.isoformat()}

    assert _module.apply_expiry_deadline(job, created_at + timedelta(days=10))
    assert datetime.fromisoformat(job["expires_at"]) == created_at + timedelta(days=30)
    assert job["ttl"] == 20 * 86_400


def test_apply_expiry_deadline_does_not_overwrite_an_existing_deadline():
    job = {"id": "job-1", "expires_at": "2026-08-01T12:00:00+00:00", "ttl": 10}

    assert not _module.apply_expiry_deadline(job, datetime(2026, 7, 1, 12, tzinfo=UTC))
    assert job["ttl"] == 10
