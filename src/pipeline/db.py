"""
Database connection and migration management for battery-brain.

Uses SQLite with WAL mode for concurrent reads (analytics queries)
while the pipeline is writing.
"""

import os
import sqlite3
import pathlib
import logging
from contextlib import contextmanager

log = logging.getLogger(__name__)

_PROJECT_ROOT = pathlib.Path(__file__).parent.parent.parent
DATA_DIR = _PROJECT_ROOT / "data"
DB_PATH = pathlib.Path(os.environ.get("DB_PATH", str(DATA_DIR / "battery_brain.db")))
MIGRATIONS_DIR = DATA_DIR / "migrations"


def get_connection(db_path: pathlib.Path = DB_PATH) -> sqlite3.Connection:
    """Return a connection with row_factory and pragmas applied."""
    conn = sqlite3.connect(str(db_path), detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


@contextmanager
def transaction(db_path: pathlib.Path = DB_PATH):
    """Context manager: yields a connection, commits on exit, rolls back on error."""
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def run_migrations(db_path: pathlib.Path = DB_PATH) -> None:
    """Apply any unapplied SQL migration files in order."""
    conn = get_connection(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     TEXT NOT NULL PRIMARY KEY,
            applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        )
        """
    )
    conn.commit()

    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    for mf in migration_files:
        version = mf.stem  # e.g. "001_initial_schema"
        if version in applied:
            continue
        log.info("Applying migration: %s", version)
        sql = mf.read_text()
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (?)", (version,)
        )
        conn.commit()
        log.info("Migration applied: %s", version)

    conn.close()
