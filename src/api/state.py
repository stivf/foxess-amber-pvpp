"""
In-process shared mutable state for the FastAPI application.

Stores the current schedule, schedule metadata, executor reference, and
the running event loop handle so synchronous code can schedule WebSocket
broadcasts safely via run_coroutine_threadsafe.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Coroutine

# Current generated schedule (list of slot dicts)
_current_schedule: list[dict] = []
_schedule_metadata: dict = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "estimated_savings_today": 0.0,
}

# Executor reference (set during lifespan startup)
_executor: Any | None = None

# Event loop reference (set during lifespan startup)
_event_loop: asyncio.AbstractEventLoop | None = None


def get_current_schedule() -> list[dict]:
    return _current_schedule


def get_schedule_metadata() -> tuple[list[dict], dict]:
    return _current_schedule, _schedule_metadata


def set_schedule(slots: list[dict], savings: float = 0.0) -> None:
    global _current_schedule, _schedule_metadata
    _current_schedule = slots
    _schedule_metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "estimated_savings_today": savings,
    }


def get_executor():
    return _executor


def set_executor(executor) -> None:
    global _executor
    _executor = executor


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _event_loop
    _event_loop = loop


def broadcast(coro: Coroutine) -> None:
    """
    Schedule a WebSocket broadcast coroutine from synchronous code.

    Safe to call from APScheduler jobs or sync route handlers.
    Drops the broadcast silently if the loop isn't running yet.
    """
    if _event_loop is not None and not _event_loop.is_closed():
        asyncio.run_coroutine_threadsafe(coro, _event_loop)
    else:
        # Loop not ready (e.g. during startup tests) — drop silently.
        pass
