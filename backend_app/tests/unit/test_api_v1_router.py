from app.api.v1.router import router as api_v1_router


def test_jobs_shared_is_registered_before_job_detail():
    paths = [route.path for route in api_v1_router.routes]

    assert "/api/v1/jobs/shared" in paths
    assert "/api/v1/jobs/{job_id}" in paths
    assert paths.index("/api/v1/jobs/shared") < paths.index("/api/v1/jobs/{job_id}")