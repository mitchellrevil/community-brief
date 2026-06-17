"""Cached service providers for Azure Function trigger wiring."""

from functools import lru_cache

from config import AppConfig
from services.analysis_provider_registry import get_analysis_provider_registry
from services.analysis_service import AnalysisService
from services.fast_transcription_service import FastTranscriptionService
from services.interfaces import BlobStorageService, TranscriptionService
from services.storage_service import StorageService


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    return AppConfig()


@lru_cache(maxsize=1)
def get_blob_storage_service() -> BlobStorageService:
    return StorageService(config=get_config())


@lru_cache(maxsize=1)
def get_transcription_service() -> TranscriptionService:
    return FastTranscriptionService(
        config=get_config(),
        storage_service=get_blob_storage_service(),
    )


@lru_cache(maxsize=1)
def get_analysis_service() -> AnalysisService:
    return AnalysisService(
        config=get_config(),
        provider_registry=get_analysis_provider_registry(),
    )


def clear_service_cache() -> None:
    get_config.cache_clear()
    get_blob_storage_service.cache_clear()
    get_transcription_service.cache_clear()
    get_analysis_service.cache_clear()
