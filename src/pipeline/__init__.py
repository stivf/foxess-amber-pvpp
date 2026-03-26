"""
battery-brain data pipeline package — src/pipeline/

Modules:
  db                          — SQLite connection, transaction context, migration runner
  amber_collector             — Amber Electric price + forecast ingestion (amberelectric SDK)
  foxess_collector            — FoxESS inverter telemetry ingestion (foxesscloud SDK)
  solar_forecast_collector    — Open-Meteo solar irradiance forecast ingestion
  aggregator                  — Silver→Gold: 30-min and daily aggregation
  analytics                   — Read-layer queries for API routes and optimization engine
"""

from .db import get_connection, transaction, run_migrations, DB_PATH
from .amber_collector import AmberCollector
from .foxess_collector import FoxESSCollector
from .solar_forecast_collector import SolarForecastCollector
from .aggregator import Aggregator
from . import analytics

__all__ = [
    "get_connection",
    "transaction",
    "run_migrations",
    "DB_PATH",
    "AmberCollector",
    "FoxESSCollector",
    "SolarForecastCollector",
    "Aggregator",
    "analytics",
]
