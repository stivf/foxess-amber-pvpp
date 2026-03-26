"""
Application configuration via Pydantic BaseSettings.

All settings can be overridden via environment variables or a .env file.
API keys are never baked into code or Docker images.
"""

from __future__ import annotations

import pathlib
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    environment: str = Field(default="development", description="development | production")
    log_level: str = Field(default="info")
    version: str = Field(default="1.0.0")

    # ── Security ─────────────────────────────────────────────────────────────
    api_key: str = Field(default="changeme", description="Bearer token for REST + WebSocket auth")

    # ── Database ─────────────────────────────────────────────────────────────
    db_path: str = Field(
        default="data/battery_brain.db",
        description="Path to SQLite database file",
    )

    # ── FoxESS ───────────────────────────────────────────────────────────────
    foxess_api_key: str = Field(default="", description="FoxESS Cloud API key")
    foxess_token: str = Field(default="", description="FoxESS Cloud user token")
    foxess_device_sn: str = Field(default="", description="FoxESS inverter serial number")

    # ── Amber Electric ───────────────────────────────────────────────────────
    amber_api_key: str = Field(default="", description="Amber Electric API key")
    amber_site_id: str = Field(default="", description="Amber Electric site ID")

    # ── Site location (for solar forecast) ───────────────────────────────────
    site_latitude: float = Field(default=-27.47, description="Site latitude (decimal degrees)")
    site_longitude: float = Field(default=153.02, description="Site longitude (decimal degrees)")
    panel_capacity_w: float = Field(default=6600.0, description="Total PV panel capacity (W)")
    panel_efficiency: float = Field(default=0.80, description="System efficiency factor")

    # ── Polling intervals ────────────────────────────────────────────────────
    foxess_poll_interval_sec: int = Field(
        default=180, ge=120, description="FoxESS telemetry poll interval (min 120s per ADR-008)"
    )
    amber_poll_interval_sec: int = Field(default=300, description="Amber price poll interval")
    solar_poll_interval_sec: int = Field(default=3600, description="Solar forecast poll interval")
    decision_engine_interval_sec: int = Field(default=900, description="Decision engine cycle (15 min)")

    # ── Battery config ────────────────────────────────────────────────────────
    bat_capacity_kwh: float = Field(default=10.0, description="Usable battery capacity (kWh)")
    bat_min_soc: int = Field(default=20, ge=0, le=100, description="Min SoC %")
    bat_max_soc: int = Field(default=95, ge=0, le=100, description="Max SoC %")

    # ── Decision engine thresholds ────────────────────────────────────────────
    charge_threshold_ckwh: float = Field(default=10.0, description="Charge below this price (c/kWh)")
    discharge_threshold_ckwh: float = Field(default=30.0, description="Discharge above this price (c/kWh)")

    @field_validator("db_path", mode="before")
    @classmethod
    def resolve_db_path(cls, v: str) -> str:
        return str(pathlib.Path(v).resolve())

    @property
    def db_path_obj(self) -> pathlib.Path:
        return pathlib.Path(self.db_path)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance. Call reset_settings() in tests to clear."""
    return Settings()


def reset_settings() -> None:
    """Clear the settings cache (for tests)."""
    get_settings.cache_clear()
