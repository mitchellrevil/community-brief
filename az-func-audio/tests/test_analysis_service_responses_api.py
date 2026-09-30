import pytest
from unittest.mock import Mock

from services.analysis_service import AnalysisService, AnalysisServiceError


def test_analyze_conversation_uses_responses_api(monkeypatch, app_config, mock_credential, sample_analysis_response):
    # Mock the ResponsesProvider to verify it's being used
    mock_provider_instance = Mock()
    mock_provider_instance.analyze.return_value = sample_analysis_response
    provider_class = Mock(return_value=mock_provider_instance)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Hello world", None)

    provider_class.assert_called_once_with(config=app_config, credential=mock_credential)
    mock_provider_instance.analyze.assert_called_once()

    assert result["analysis_text"] == sample_analysis_response
    assert result["status"] == "success"


def test_analyze_conversation_uses_managed_identity(monkeypatch, app_config, mock_credential, sample_analysis_response):
    app_config.azure_openai_api_key = None

    # Mock the ResponsesProvider - it should handle managed identity internally
    mock_provider_instance = Mock()
    mock_provider_instance.analyze.return_value = sample_analysis_response
    provider_class = Mock(return_value=mock_provider_instance)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Hello world", None)

    provider_class.assert_called_once_with(config=app_config, credential=mock_credential)
    assert result["analysis_text"] == sample_analysis_response


def test_analyze_conversation_raises_when_no_text(monkeypatch, app_config, mock_credential):
    # Provider should raise ValueError when response is empty
    mock_provider_instance = Mock()
    mock_provider_instance.analyze.side_effect = ValueError("Missing text output in response from OpenAI")
    provider_class = Mock(return_value=mock_provider_instance)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )

    with pytest.raises(AnalysisServiceError):
        svc.analyze_conversation("Hello world", None)
