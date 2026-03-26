"""
Integration tests for the database migration runner.

Tests:
  - Migrations apply in order (001 before 002, etc.)
  - Already-applied migrations are skipped (idempotent)
  - All expected tables are created after full migration
  - Default profile is seeded by migration 003
  - Default system_config rows are seeded by migration 001
"""

import sqlite3
import pathlib
import tempfile

import pytest

from src.pipeline.db import run_migrations, get_connection


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def _get_applied_versions(conn: sqlite3.Connection) -> list[str]:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(version TEXT NOT NULL PRIMARY KEY, applied_at TEXT)"
    )
    rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    return [r[0] for r in rows]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMigrationRunner:
    def test_run_migrations_creates_all_tables(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_migrations.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        tables = _get_tables(conn)
        conn.close()

        expected_tables = {
            # Bronze
            "raw_amber_prices", "raw_foxess_telemetry", "raw_solar_forecasts",
            # Silver
            "prices", "telemetry", "solar_forecasts",
            # Gold
            "interval_summary_30min", "daily_summary",
            # Operational
            "optimization_decisions", "system_config", "pipeline_runs",
            # Budget
            "foxess_api_budget",
            # Profiles & calendar
            "profiles", "calendar_rules", "calendar_overrides",
            # Migrations tracker
            "schema_migrations",
        }
        missing = expected_tables - tables
        assert not missing, f"Missing tables after migration: {missing}"

    def test_migrations_applied_in_order(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_order.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        versions = _get_applied_versions(conn)
        conn.close()

        assert versions == sorted(versions), "Migrations not applied in alphabetical order"

    def test_migration_runner_is_idempotent(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_idempotent.db"
        run_migrations(db_path=db_path)
        run_migrations(db_path=db_path)  # Run again — should not raise

        conn = get_connection(db_path)
        versions = _get_applied_versions(conn)
        conn.close()

        # Versions should not be duplicated
        assert len(versions) == len(set(versions))

    def test_default_profile_seeded_by_migration_003(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_profile.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        row = conn.execute(
            "SELECT id, name, is_default FROM profiles WHERE is_default = 1"
        ).fetchone()
        conn.close()

        assert row is not None, "No default profile found after migration"
        assert row["id"] == "prof_default"
        assert row["name"] == "Balanced"

    def test_system_config_seeded_by_migration_001(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_config.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        rows = conn.execute("SELECT key FROM system_config").fetchall()
        conn.close()

        keys = {r["key"] for r in rows}
        expected_keys = {
            "bat_capacity_kwh", "bat_min_soc", "bat_max_soc",
            "charge_threshold_ckwh", "discharge_threshold_ckwh",
            "poll_interval_sec", "price_poll_interval_sec",
            "foxess_daily_limit", "foxess_command_reserve",
        }
        missing = expected_keys - keys
        assert not missing, f"Missing config keys after migration: {missing}"

    def test_foxess_api_budget_table_created_by_migration_002(
        self, tmp_path: pathlib.Path
    ):
        db_path = tmp_path / "test_budget.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        tables = _get_tables(conn)
        conn.close()
        assert "foxess_api_budget" in tables

    def test_calendar_tables_created_by_migration_003(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_calendar.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        tables = _get_tables(conn)
        conn.close()

        assert "calendar_rules" in tables
        assert "calendar_overrides" in tables

    def test_wal_mode_enabled(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_wal.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        conn.close()
        assert mode == "wal"

    def test_foreign_keys_enabled(self, tmp_path: pathlib.Path):
        db_path = tmp_path / "test_fk.db"
        run_migrations(db_path=db_path)

        conn = get_connection(db_path)
        fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        conn.close()
        assert fk == 1
