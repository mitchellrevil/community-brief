import asyncio
import os
import sys
import uuid

import azure.functions as func

base_dir = os.path.dirname(__file__)
if base_dir and base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from config import AppConfig, resolve_log_level
from core.logging import function_invocation_logs, get_logger, redact, setup_logging
from services.blob_processing_service import BlobProcessingService
from services.reprocess_service import ReprocessService
from services.reprocess_operation_store import ReprocessOperationStore
from services.reprocess_queue_handler import ReprocessCommand, ReprocessQueueHandler
from services.service_providers import (
    get_analysis_service,
    get_blob_storage_service,
    get_transcription_service,
)


PROCESSING_TIMEOUT_SECONDS = 3600
REPROCESS_QUEUE_NAME = "analysis-reprocess"


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


def _build_reprocess_queue_handler() -> ReprocessQueueHandler:
    from services.cosmos_service import CosmosService

    config = AppConfig()
    return ReprocessQueueHandler(
        operation_store=ReprocessOperationStore(CosmosService(config)),
        reprocess_service=_build_reprocess_service(),
    )


@app.blob_trigger(
    arg_name="myblob",
    path="%AZURE_STORAGE_RECORDINGS_CONTAINER%/{name}",
    connection="audio",
)
def blob_trigger(myblob: func.InputStream):
    with function_invocation_logs("blob_trigger"):
        _blob_trigger(myblob)


def _blob_trigger(myblob: func.InputStream):
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


@app.function_name(name="ReprocessAnalysisQueue")
@app.queue_trigger(
    arg_name="message",
    queue_name=REPROCESS_QUEUE_NAME,
    connection="audio",
)
def reprocess_analysis_queue(message: func.QueueMessage) -> None:
    with function_invocation_logs("ReprocessAnalysisQueue"):
        command = ReprocessCommand.from_message_body(message.get_body())
        dequeue_count = max(int(message.dequeue_count or 1), 1)
        _build_reprocess_queue_handler().process(
            command,
            dequeue_count=dequeue_count,
        )
