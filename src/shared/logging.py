"""
Structured logging setup using structlog.

Call configure_logging() once at application startup (in main.py lifespan).
After that, use structlog.get_logger() anywhere in the codebase.
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(log_level: str = "info", json_logs: bool = False) -> None:
    """
    Configure structlog with appropriate processors for dev vs. production.

    Args:
        log_level:  Logging level string (debug, info, warning, error).
        json_logs:  If True, output newline-delimited JSON (production).
                    If False, output coloured human-readable format (dev).
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if json_logs:
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib logging so third-party libraries (uvicorn, APScheduler)
    # integrate cleanly with structlog output.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    # Suppress noisy loggers
    logging.getLogger("apscheduler.executors.default").setLevel(logging.WARNING)
    logging.getLogger("apscheduler.scheduler").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Convenience wrapper around structlog.get_logger()."""
    return structlog.get_logger(name)
