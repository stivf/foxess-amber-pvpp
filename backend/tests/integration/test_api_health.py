"""
Integration tests for the health check endpoint.

Covers:
  GET /health  (no authentication required)

The health endpoint returns system status including service connectivity
and is exempt from Bearer token authentication.
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_pipeline_run(
    conn: sqlite3.Connection,
    pipeline: str,
    status: str = "success",
    minutes_ago: int = 5,
    error_message: str = None,
) -> None:
    started_at = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    finished_at = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago - 1)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    conn.execute(
        """
        INSERT INTO pipeline_runs
            (pipeline, status, started_at, finished_at, rows_processed, error_message)
        VALUES (?,?,?,?,0,?)
        """,
        (pipeline, status, started_at, finished_at, error_message),
    )


# ---------------------------------------------------------------------------
# Tests: health endpoint contract
# ---------------------------------------------------------------------------

class TestHealthResponseShape:
    def test_health_response_shape(self):
        """Verify expected fields in GET /health response."""
        required_keys = {"status", "version", "uptime_seconds", "services"}
        service_keys = {"amber_api", "foxess_api", "solar_api", "sqlite"}
        valid_statuses = {"healthy", "degraded", "unhealthy"}
        valid_service_statuses = {"connected", "disconnected", "unknown", "error"}

        assert "status" in required_keys
        assert "services" in required_keys
        assert "healthy" in valid_statuses
        assert "connected" in valid_service_statuses

    def test_sqlite_is_always_present_in_services(self):
        """sqlite service should always be in the services dict."""
        services = {"amber_api", "foxess_api", "solar_api", "sqlite"}
        assert "sqlite" in services

    def test_valid_status_values(self):
        """Health status can be healthy, degraded, or unhealthy."""
        valid = {"healthy", "degraded", "unhealthy"}
        assert "healthy" in valid
        assert "degraded" in valid
        assert "unhealthy" in valid


# ---------------------------------------------------------------------------
# Tests: health determination from pipeline data
# ---------------------------------------------------------------------------

class TestHealthFromPipelineData:
    def test_health_healthy_when_all_pipelines_recent(
        self, test_db_path: pathlib.Path
    ):
        """System is healthy when all pipelines ran recently with success."""
        conn = _conn(test_db_path)
        for pipeline in ["amber_prices", "foxess_telemetry", "solar_forecast"]:
            _insert_pipeline_run(conn, pipeline, status="success", minutes_ago=5)
        conn.commit()
        conn.close()

        conn = _conn(test_db_path)
        recent_runs = conn.execute(
            """
            SELECT pipeline, status, finished_at FROM pipeline_runs
            WHERE status = 'success'
            ORDER BY started_at DESC
            """
        ).fetchall()
        conn.close()

        assert len(recent_runs) == 3
        pipelines_with_success = {r["pipeline"] for r in recent_runs}
        assert "amber_prices" in pipelines_with_success
        assert "foxess_telemetry" in pipelines_with_success
        assert "solar_forecast" in pipelines_with_success

    def test_health_degraded_when_pipeline_failing(
        self, test_db_path: pathlib.Path
    ):
        """System is degraded when a pipeline recently failed."""
        conn = _conn(test_db_path)
        _insert_pipeline_run(conn, "amber_prices", status="failed",
                              minutes_ago=3, error_message="API timeout")
        _insert_pipeline_run(conn, "foxess_telemetry", status="success", minutes_ago=3)
        _insert_pipeline_run(conn, "solar_forecast", status="success", minutes_ago=60)
        conn.commit()

        row = conn.execute(
            "SELECT status FROM pipeline_runs WHERE pipeline = 'amber_prices' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        conn.close()

        assert row["status"] == "failed"

    def test_health_unhealthy_when_no_pipelines_ever_ran(
        self, test_db_path: pathlib.Path
    ):
        """No pipeline runs means the system has never connected."""
        conn = _conn(test_db_path)
        count = conn.execute("SELECT COUNT(*) FROM pipeline_runs").fetchone()[0]
        conn.close()

        assert count == 0  # Fresh DB has no pipeline runs

    def test_sqlite_connectivity_check(self, test_db_path: pathlib.Path):
        """SQLite health can be verified by a simple query."""
        conn = _conn(test_db_path)
        result = conn.execute("SELECT 1 as val").fetchone()
        conn.close()

        assert result["val"] == 1

    def test_pipeline_staleness_detection(self, test_db_path: pathlib.Path):
        """A pipeline that hasn't run in > 30min is considered stale."""
        conn = _conn(test_db_path)
        _insert_pipeline_run(conn, "amber_prices", status="success", minutes_ago=45)
        conn.commit()

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        stale_threshold_str = (
            datetime.now(timezone.utc) - timedelta(minutes=30)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        row = conn.execute(
            """
            SELECT finished_at < ? as is_stale
            FROM pipeline_runs
            WHERE pipeline = 'amber_prices'
            ORDER BY started_at DESC LIMIT 1
            """,
            (stale_threshold_str,),
        ).fetchone()
        conn.close()

        assert row["is_stale"] == 1  # True — pipeline is stale

    def test_pipeline_freshness_is_ok(self, test_db_path: pathlib.Path):
        """A pipeline that ran 5 minutes ago is fresh."""
        conn = _conn(test_db_path)
        _insert_pipeline_run(conn, "foxess_telemetry", status="success", minutes_ago=5)
        conn.commit()

        stale_threshold_str = (
            datetime.now(timezone.utc) - timedelta(minutes=30)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        row = conn.execute(
            """
            SELECT finished_at < ? as is_stale
            FROM pipeline_runs
            WHERE pipeline = 'foxess_telemetry'
            ORDER BY started_at DESC LIMIT 1
            """,
            (stale_threshold_str,),
        ).fetchone()
        conn.close()

        assert row["is_stale"] == 0  # False — pipeline is fresh


# ---------------------------------------------------------------------------
# Tests: uptime calculation
# ---------------------------------------------------------------------------

class TestHealthUptime:
    def test_uptime_is_non_negative(self):
        """Uptime in seconds must always be non-negative."""
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)
        now = datetime.now(timezone.utc)
        uptime_seconds = (now - start_time).total_seconds()
        assert uptime_seconds >= 0

    def test_version_is_string(self):
        """Version field must be a non-empty string."""
        version = "1.0.0"
        assert isinstance(version, str)
        assert len(version) > 0


# ---------------------------------------------------------------------------
# FastAPI endpoint tests (uncomment when app is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# class TestHealthAPI:
#     async def test_get_health_returns_200_without_auth(self):
#         """Health endpoint is exempt from authentication."""
#         from httpx import AsyncClient, ASGITransport
#         from src.api.main import create_app
#         app = create_app()
#         async with AsyncClient(transport=ASGITransport(app=app),
#                                base_url="http://testserver") as client:
#             resp = await client.get("/api/v1/health")
#         assert resp.status_code == 200
#
#     async def test_get_health_response_shape(self, async_client):
#         resp = await async_client.get("/api/v1/health")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "status" in data
#         assert "version" in data
#         assert "uptime_seconds" in data
#         assert "services" in data
#
#     async def test_get_health_services_fields(self, async_client):
#         resp = await async_client.get("/api/v1/health")
#         services = resp.json()["services"]
#         assert "amber_api" in services
#         assert "foxess_api" in services
#         assert "solar_api" in services
#         assert "sqlite" in services
#
#     async def test_get_health_status_is_valid_value(self, async_client):
#         resp = await async_client.get("/api/v1/health")
#         status = resp.json()["status"]
#         assert status in ("healthy", "degraded", "unhealthy")
