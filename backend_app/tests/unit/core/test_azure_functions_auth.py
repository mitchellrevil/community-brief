from app.services.jobs.job_reprocess_service import get_azure_functions_auth_headers


def test_get_azure_functions_auth_headers_uses_configured_key():
    assert get_azure_functions_auth_headers(
        "https://func.example.com",
        function_key="secret",
    ) == {"x-functions-key": "secret"}


def test_get_azure_functions_auth_headers_returns_empty_without_key():
    assert get_azure_functions_auth_headers("https://func.example.com") == {}
