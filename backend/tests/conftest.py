"""
Shared pytest fixtures for battery-brain backend tests.

Provides:
  - test_db_path: fresh SQLite DB with all migrations applied (function scope)
  - seeded_db_path: test DB pre-loaded with representative data
  - async_client: httpx AsyncClient against the FastAPI app (auth header included)
  - Mock patches for amberelectric SDK, foxesscloud SDK, and httpx (Open-Meteo)
"""

import json
import pathlib
import sqlite3
import tempfile
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio

# ─────────────────────────────────────────────────────────────
# DB HELPERS
# ─────────────────────────────────────────────────────────────

MIGRATIONS_DIR = pathlib.Path(__file__).parent.parent.parent / "data" / "migrations"


def apply_migrations(db_path: pathlib.Path) -> None:
    """Apply all SQL migration files in order to the given SQLite DB."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     TEXT NOT NULL PRIMARY KEY,
            applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        )
        """
    )
    conn.commit()
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for mf in sorted(MIGRATIONS_DIR.glob("*.sql")):
        version = mf.stem
        if version not in applied:
            conn.executescript(mf.read_text())
            conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            conn.commit()
    conn.close()


def _insert_price(conn: sqlite3.Connection, interval_start: str, channel_type: str,
                  per_kwh: float = 10.0, spot_per_kwh: float = 8.0,
                  spike_status: str = "none", descriptor: str = "low",
                  renewables: float = 45.0, is_forecast: int = 0) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO prices
            (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
             renewables, spike_status, descriptor, updated_at)
        VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
         renewables, spike_status, descriptor),
    )


def _insert_telemetry(conn: sqlite3.Connection, recorded_at: str, device_sn: str = "TEST001",
                      bat_soc: float = 72.0, pv_power_w: float = 3200.0,
                      bat_power_w: float = 1500.0, grid_power_w: float = -500.0,
                      load_power_w: float = 1200.0, bat_temp_c: float = 28.5,
                      work_mode: str = "Self Use") -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO telemetry
            (recorded_at, device_sn, pv_power_w, bat_power_w, grid_power_w,
             load_power_w, bat_soc, bat_temp_c, work_mode, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (recorded_at, device_sn, pv_power_w, bat_power_w, grid_power_w,
         load_power_w, bat_soc, bat_temp_c, work_mode),
    )


def _insert_solar_forecast(conn: sqlite3.Connection, slot_start: str,
                           ghi_wm2: float = 500.0, est_pv_yield_wh: float = 2640.0,
                           cloud_cover_pct: float = 10.0, temp_c: float = 25.0) -> None:
    slot_end = (
        datetime.fromisoformat(slot_start.replace("Z", "+00:00")) + timedelta(hours=1)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        """
        INSERT OR REPLACE INTO solar_forecasts
            (slot_start, slot_end, forecast_source, forecast_run_time,
             ghi_wm2, est_pv_yield_wh, cloud_cover_pct, temp_c, updated_at)
        VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'),?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (slot_start, slot_end, "open-meteo", ghi_wm2, est_pv_yield_wh, cloud_cover_pct, temp_c),
    )


def _insert_profile(conn: sqlite3.Connection, profile_id: str, name: str,
                    export_agg: float = 0.5, preservation_agg: float = 0.5,
                    import_agg: float = 0.5, is_default: int = 0) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO profiles
            (id, name, export_aggressiveness, preservation_aggressiveness,
             import_aggressiveness, is_default)
        VALUES (?,?,?,?,?,?)
        """,
        (profile_id, name, export_agg, preservation_agg, import_agg, is_default),
    )


# ─────────────────────────────────────────────────────────────
# CORE FIXTURES
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def test_db_path(tmp_path: pathlib.Path) -> pathlib.Path:
    """Fresh SQLite DB with all migrations applied. No data seeded."""
    db = tmp_path / "test.db"
    apply_migrations(db)
    return db


@pytest.fixture
def seeded_db_path(test_db_path: pathlib.Path) -> pathlib.Path:
    """
    Test DB pre-loaded with representative data for analytics/API tests:
    - 3 telemetry readings (3 minutes apart)
    - 6 price intervals (general + feedIn for 3 slots)
    - 2 solar forecast slots
    - 1 default profile (already seeded by migration 003)
    - 1 extra profile + 1 calendar rule
    """
    conn = sqlite3.connect(str(test_db_path))
    conn.execute("PRAGMA foreign_keys = ON")

    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    t0 = (now - timedelta(minutes=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t1 = (now - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t2 = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Telemetry
    _insert_telemetry(conn, t0, bat_soc=70.0)
    _insert_telemetry(conn, t1, bat_soc=71.0)
    _insert_telemetry(conn, t2, bat_soc=72.0)

    # Price intervals — current slot
    price_slot = now.replace(minute=(now.minute // 30) * 30, second=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    _insert_price(conn, price_slot, "general", per_kwh=8.5, spike_status="none", descriptor="low")
    _insert_price(conn, price_slot, "feedIn", per_kwh=3.2)

    # Forecast slots
    f1 = (now + timedelta(minutes=30)).replace(minute=((now.minute // 30 + 1) % 2 * 30), second=0)
    f1_str = f1.strftime("%Y-%m-%dT%H:%M:%SZ")
    f2_str = (f1 + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    _insert_price(conn, f1_str, "general", per_kwh=12.0, is_forecast=1, descriptor="neutral")
    _insert_price(conn, f1_str, "feedIn", per_kwh=3.5, is_forecast=1)
    _insert_price(conn, f2_str, "general", per_kwh=35.0, is_forecast=1, spike_status="potential", descriptor="high")
    _insert_price(conn, f2_str, "feedIn", per_kwh=3.5, is_forecast=1)

    # Solar forecasts
    solar_slot = now.replace(minute=0, second=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    _insert_solar_forecast(conn, solar_slot, ghi_wm2=500.0, est_pv_yield_wh=2640.0)
    next_solar = (now.replace(minute=0, second=0) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    _insert_solar_forecast(conn, next_solar, ghi_wm2=600.0, est_pv_yield_wh=3168.0)

    # Extra profile for calendar tests
    _insert_profile(conn, "prof_peak_export", "Peak Export",
                    export_agg=0.9, preservation_agg=0.2, import_agg=0.7)

    conn.commit()
    conn.close()
    return test_db_path


# ─────────────────────────────────────────────────────────────
# MOCK FIXTURES — external APIs
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_amber_sdk():
    """
    Mock amberelectric SDK client. Returns fixture price interval objects.
    Patch at the collector module level.
    """
    mock_interval = MagicMock()
    mock_interval.channel_type = MagicMock(value="general")
    mock_interval.type = MagicMock(value="ActualInterval")
    mock_interval.spike_status = MagicMock(value="none")
    mock_interval.descriptor = MagicMock(value="low")
    mock_interval.start_time = "2026-03-25T10:00:00+11:00"
    mock_interval.end_time = "2026-03-25T10:30:00+11:00"
    mock_interval.spot_per_kwh = 8.0
    mock_interval.per_kwh = 10.5
    mock_interval.renewables = 45.0
    mock_interval.estimate = False
    mock_interval.tariff_information = ""
    mock_interval.range = ""

    with patch("src.pipeline.amber_collector.amber_api.AmberApi") as mock_api_cls:
        mock_api = MagicMock()
        mock_api.get_current_price.return_value = [mock_interval]
        mock_api.get_prices.return_value = [mock_interval]
        mock_api_cls.return_value = mock_api
        yield mock_api


@pytest.fixture
def mock_foxess_sdk():
    """
    Mock foxesscloud.openapi.get_real() — returns a representative device dict.
    """
    device_data = {
        "pvPower": 3200.0,
        "batChargePower": 1500.0,
        "batDischargePower": 0.0,
        "gridConsumptionPower": 0.0,
        "feedinPower": 500.0,
        "loadsPower": 1200.0,
        "epsPower": 0.0,
        "SoC": 72.0,
        "batTemperature": 28.5,
        "batVolt": 51.2,
        "batCurrent": 29.3,
        "ambientTemperation": 35.0,
        "gridVoltage": 230.5,
        "gridFrequency": 50.0,
        "workMode": "Self Use",
        "todayYield": 12.5,
        "chargeEnergyToday": 8.0,
        "dischargeEnergyToday": 3.0,
        "gridConsumptionEnergyToday": 1.5,
        "feedinEnergyToday": 5.0,
        "time": "2026-03-25T10:06:00Z",
    }
    with patch("src.pipeline.foxess_collector.f.get_real", return_value=device_data) as mock_fn:
        yield mock_fn


@pytest.fixture
def mock_open_meteo():
    """Mock httpx.get() for Open-Meteo solar forecast API."""
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(48)]
    forecast_response = {
        "hourly": {
            "time": times,
            "shortwave_radiation": [500.0] * 48,
            "direct_normal_irradiance": [400.0] * 48,
            "diffuse_radiation": [100.0] * 48,
            "temperature_2m": [25.0] * 48,
            "cloudcover": [10.0] * 48,
        }
    }
    mock_response = MagicMock()
    mock_response.json.return_value = forecast_response
    mock_response.raise_for_status = MagicMock()

    with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_response) as mock_get:
        yield mock_get


# ─────────────────────────────────────────────────────────────
# FASTAPI TEST CLIENT
# Uncomment once the FastAPI app is implemented at src/api/main.py
# ─────────────────────────────────────────────────────────────

TEST_API_KEY = "test-api-key-abc123"


@pytest_asyncio.fixture
async def async_client(seeded_db_path: pathlib.Path) -> AsyncGenerator:
    """
    Async httpx client connected to the FastAPI app.
    Uses seeded test DB; all external SDKs are mocked.

    Requires:
      - src/api/main.py with a create_app() factory function
      - The app reads DB_PATH and API_KEY from environment variables
    """
    import os
    os.environ["DB_PATH"] = str(seeded_db_path)
    os.environ["API_KEY"] = TEST_API_KEY

    # Clear settings cache so the test DB path is picked up
    from src.shared.config import reset_settings
    reset_settings()

    from httpx import AsyncClient, ASGITransport
    from src.api.main import create_app
    from unittest.mock import patch, MagicMock

    # Patch the scheduler so it doesn't start background jobs during tests
    with patch("src.api.main.BackgroundScheduler") as mock_scheduler_cls:
        mock_scheduler = MagicMock()
        mock_scheduler.get_jobs.return_value = []
        mock_scheduler_cls.return_value = mock_scheduler

        app = create_app()
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {TEST_API_KEY}"},
        ) as client:
            yield client

    # Clear settings cache again after test so it doesn't leak
    reset_settings()
