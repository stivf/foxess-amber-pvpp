"""
FastAPI dependency injection for DB connections, config, and shared services.
"""
from __future__ import annotations

import sqlite3
from typing import Annotated, Generator

from fastapi import Depends, Header, HTTPException, status

from src.shared.config import Settings, get_settings
from src.pipeline.db import get_connection


def get_db(settings: Annotated[Settings, Depends(get_settings)]) -> Generator[sqlite3.Connection, None, None]:
    """Yield a SQLite connection for the request lifetime, then close it."""
    conn = get_connection(settings.db_path_obj)
    try:
        yield conn
    finally:
        conn.close()


def require_auth(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    """Validate Bearer token against the configured API key."""
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Missing Authorization header"}},
        )
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid Authorization format"}},
        )
    if parts[1] != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid API key"}},
        )


# Type aliases for cleaner route signatures
DbConn = Annotated[sqlite3.Connection, Depends(get_db)]
Auth = Annotated[None, Depends(require_auth)]
AppSettings = Annotated[Settings, Depends(get_settings)]
