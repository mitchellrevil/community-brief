from __future__ import annotations

import logging
import sys

import structlog
from structlog.typing import Processor


def configure_logging(log_level: str = "INFO", *, environment: str = "development") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    is_local = environment.lower() in {"local", "development", "dev", "test"}

    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    renderer: Processor
    if is_local:
        renderer = structlog.dev.ConsoleRenderer(colors=False)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
        level=level,
        force=True,
    )
    for noisy_logger in ("azure", "azure.cosmos", "azure.identity", "azure.core", "urllib3"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


get_logger = structlog.get_logger
