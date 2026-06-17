import pytest

from app.services.jobs.job_reprocess_service import build_azure_function_url


def test_build_azure_function_url_uses_functions_route_prefix():
    assert (
        build_azure_function_url("https://func.example.com/", "reprocess-analysis")
        == "https://func.example.com/api/reprocess-analysis"
    )


def test_build_azure_function_url_requires_base_url():
    with pytest.raises(ValueError, match="base_url is required"):
        build_azure_function_url("", "reprocess-analysis")
