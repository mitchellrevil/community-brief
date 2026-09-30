"""
Tests for analysis provider configuration and protocol definition.

This module verifies that:
1. AppConfig correctly reads and validates the default_analysis_provider setting
2. Invalid provider names are rejected with helpful errors
3. The AnalysisProvider Protocol is properly defined with required methods
"""

import pytest
import os
from unittest.mock import Mock
from typing import Protocol, runtime_checkable

from config import AppConfig


def test_app_config_reads_default_provider_from_env(monkeypatch):
    """Verify that AppConfig reads AZURE_OPENAI_DEFAULT_PROVIDER from environment."""
    # Set required env vars
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://test.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_OPENAI_DEFAULT_PROVIDER", "chat_completions")

    config = AppConfig()

    assert config.default_analysis_provider == "chat_completions"


def test_app_config_default_provider_fallback_to_responses(monkeypatch):
    """Verify that AppConfig defaults to 'responses' when env var not set."""
    # Set required env vars but omit AZURE_OPENAI_DEFAULT_PROVIDER
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://test.documents.azure.com:443/")

    config = AppConfig()

    assert config.default_analysis_provider == "responses"


def test_app_config_rejects_invalid_provider(monkeypatch):
    """Verify that AppConfig raises ValueError for unsupported provider names."""
    # Set required env vars with invalid provider
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://test.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_OPENAI_DEFAULT_PROVIDER", "gpt-turbo-mega")

    with pytest.raises(ValueError) as exc_info:
        AppConfig()

    assert "Invalid analysis provider" in str(exc_info.value)
    assert "gpt-turbo-mega" in str(exc_info.value)


def test_app_config_accepts_responses_provider(monkeypatch):
    """Verify that 'responses' is a valid provider name."""
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://test.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_OPENAI_DEFAULT_PROVIDER", "responses")

    config = AppConfig()

    assert config.default_analysis_provider == "responses"


def test_app_config_accepts_chat_completions_provider(monkeypatch):
    """Verify that 'chat_completions' is a valid provider name."""
    monkeypatch.setenv("AZURE_COSMOS_ENDPOINT", "https://test.documents.azure.com:443/")
    monkeypatch.setenv("AZURE_OPENAI_DEFAULT_PROVIDER", "chat_completions")

    config = AppConfig()

    assert config.default_analysis_provider == "chat_completions"


def test_analysis_provider_protocol_definition():
    """The provider protocol intentionally exposes one operation."""
    from services.interfaces import AnalysisProvider

    assert issubclass(AnalysisProvider, Protocol)
    assert hasattr(AnalysisProvider, "analyze")


def test_analysis_provider_protocol_is_runtime_checkable():
    """Verify that AnalysisProvider Protocol uses @runtime_checkable decorator."""
    from services.interfaces import AnalysisProvider

    # Check if runtime_checkable was applied
    assert hasattr(AnalysisProvider, "_is_runtime_protocol")
    assert AnalysisProvider._is_runtime_protocol is True


def test_analysis_provider_protocol_method_signatures():
    """Providers receive a single resolved request object."""
    from services.interfaces import AnalysisProvider
    import inspect

    signature = inspect.signature(AnalysisProvider.analyze)
    assert list(signature.parameters) == ["self", "request"]
    assert signature.return_annotation == str
