import asyncio
import json
import os
import sys
import uuid
from typing import Any, Dict

import azure.functions as func

base_dir = os.path.dirname(__file__)
if base_dir and base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from config import AppConfig, resolve_log_level
from core.logging import get_logger, redact, setup_logging
from services.blob_processing_service import BlobProcessingService
from services.reprocess_service import ReprocessService
from services.service_providers import (
    get_analysis_service,
    get_blob_storage_service,
    get_transcription_service,
)


PROCESSING_TIMEOUT_SECONDS = 3600


setup_logging(level=resolve_log_level(), format_json=False)
logger = get_logger(__name__)
logger.debug(
    "function_app.initialized",
    log_level=resolve_log_level(),
    base_dir=base_dir,
)

app = func.FunctionApp()

FUNCTION_APP_ERRORS = (RuntimeError, ValueError, TypeError, OSError)


def _build_blob_processing_service() -> BlobProcessingService:
    return BlobProcessingService(
        config_factory=AppConfig,
        storage_service_factory=get_blob_storage_service,
        transcription_service_factory=get_transcription_service,
        analysis_service_factory=get_analysis_service,
    )


def _build_reprocess_service() -> ReprocessService:
    return ReprocessService(
        config_factory=AppConfig,
        storage_service_factory=get_blob_storage_service,
        analysis_service_factory=get_analysis_service,
    )


def _build_json_response(payload: Dict[str, Any], status_code: int) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload),
        status_code=status_code,
        mimetype="application/json",
    )


@app.blob_trigger(
    arg_name="myblob",
    path="%AZURE_STORAGE_RECORDINGS_CONTAINER%/{name}",
    connection="audio",
)
def blob_trigger(myblob: func.InputStream):
    correlation_id = str(uuid.uuid4())
    blob_url = myblob.uri
    blob_path = myblob.name

    logger.info(
        "blob_trigger.received",
        correlation_id=correlation_id,
        blob_url=redact(blob_url, keep=60),
        blob_path=blob_path,
        blob_size=myblob.length,
    )

    try:
        asyncio.run(
            asyncio.wait_for(
                _process_blob_with_timeout(myblob, correlation_id, blob_url, blob_path),
                timeout=PROCESSING_TIMEOUT_SECONDS,
            )
        )
    except asyncio.TimeoutError:
        logger.error(
            "blob_trigger.timed_out",
            correlation_id=correlation_id,
            blob_path=blob_path,
        )
        _build_blob_processing_service().mark_job_failed(
            job_id=None,
            cosmos_service=None,
            blob_url=blob_url,
            blob_path=blob_path,
            correlation_id=correlation_id,
            error_message="Processing timeout: exceeded 60 minute limit",
        )
        raise
    except FUNCTION_APP_ERRORS:
        logger.exception(
            "blob_trigger.failed",
            correlation_id=correlation_id,
            blob_path=blob_path,
        )
        raise


async def _process_blob_with_timeout(
    myblob: func.InputStream,
    correlation_id: str,
    blob_url: str,
    blob_path: str,
):
    await _build_blob_processing_service().process_blob(
        myblob,
        correlation_id=correlation_id,
        blob_url=blob_url,
        blob_path=blob_path,
    )


@app.function_name(name="ReprocessAnalysis")
@app.route(route="reprocess-analysis", methods=["POST"])
def reprocess_analysis_http(req: func.HttpRequest) -> func.HttpResponse:
    correlation_id = req.headers.get("x-correlation-id") or str(uuid.uuid4())

    try:
        payload = req.get_json()
    except ValueError:
        return _build_json_response(
            {"status": "error", "message": "Invalid JSON payload"},
            status_code=400,
        )

    response = _build_reprocess_service().reprocess(
        payload,
        correlation_id=correlation_id,
    )
    return _build_json_response(response.payload, status_code=response.status_code)
