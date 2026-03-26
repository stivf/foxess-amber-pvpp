# battery-brain: Data Pipeline Design

## Overview

SQLite-backed time-series pipeline using a Medallion Architecture (Bronze / Silver / Gold).
All data flows from external APIs into the database; the optimization engine and dashboard
consume exclusively from the Silver and Gold layers.

```
External APIs
  Amber Electric v2      ─┐
  FoxESS Cloud v0        ─┼──► Bronze (raw, append-only)
  Open-Meteo             ─┘         │
                                     ▼
                               Silver (cleansed, deduplicated, conformed)
                                     │
                                     ▼
                               Gold (aggregated, analytics-ready)
                                 ├── interval_summary_30min
                                 └── daily_summary
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                  Optimization Engine     Dashboard API
```

---

## Database

- **Engine**: SQLite 3 with WAL mode (concurrent reads while writing)
- **File**: `data/battery_brain.db`
- **Migrations**: `data/migrations/001_initial_schema.sql`
- **Migration runner**: `data/pipeline/db.py::run_migrations()`

---

## Data Sources

| Source | API | Update Frequency | Protocol |
|--------|-----|-----------------|---------|
| Amber Electric | REST v2 `/sites/{id}/prices` | 5 min (prices), 30 min (settlement) | Poll |
| FoxESS Cloud | REST v0 `/op/v0/device/real/query` | 1 min (poll) | Poll + HMAC auth |
| Open-Meteo | REST `/v1/forecast` | 1 hour | Poll |

---

## Schema: Bronze Layer (Raw Ingest)

Append-only. Never modified after insert. Schema evolution via `mergeSchema`.

### `raw_amber_prices`
Raw Amber API price intervals. One row per API interval per channel.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `ingested_at` | TEXT | UTC timestamp of ingestion |
| `source_url` | TEXT | API endpoint called |
| `interval_start` / `interval_end` | TEXT | UTC ISO8601 |
| `interval_type` | TEXT | `ActualInterval` \| `ForecastInterval` \| `CurrentInterval` |
| `channel_type` | TEXT | `general` \| `feedIn` \| `controlledLoad` |
| `spot_per_kwh` | REAL | Raw spot price (c/kWh) |
| `per_kwh` | REAL | All-in price paid/received (c/kWh) |
| `renewables` | REAL | % renewable generation (0–100) |
| `spike_status` | TEXT | `none` \| `potential` \| `spike` |
| `descriptor` | TEXT | `veryLow` \| `low` \| `neutral` \| `high` \| `spike` \| `extremelyHigh` |
| `estimate` | INTEGER | 1 if forecast/estimate, 0 if actual |

### `raw_foxess_telemetry`
Raw FoxESS realtime device data. One row per poll per device.

| Column | Type | Description |
|--------|------|-------------|
| `device_sn` | TEXT | Inverter serial number |
| `device_time_utc` | TEXT | UTC-normalised timestamp |
| `pv_power_w` | REAL | Solar generation (W) |
| `bat_power_w` | REAL | Battery: +charge, -discharge (W) |
| `grid_power_w` | REAL | Grid: +import, -export (W) |
| `load_power_w` | REAL | House consumption (W) |
| `bat_soc` | REAL | State of Charge (%) |
| `bat_temp_c` | REAL | Battery temperature (°C) |
| `work_mode` | TEXT | `Self Use` \| `Feed-in First` \| `Backup` \| `Force Charge` \| `Force Discharge` |
| `today_yield_kwh` | REAL | PV yield today (lifetime counter, kWh) |

### `raw_solar_forecasts`
Raw Open-Meteo hourly irradiance data. One row per slot per forecast run.

| Column | Type | Description |
|--------|------|-------------|
| `forecast_source` | TEXT | `open-meteo` |
| `forecast_run_time` | TEXT | When this forecast was generated |
| `slot_start` / `slot_end` | TEXT | UTC ISO8601 |
| `ghi_wm2` | REAL | Global Horizontal Irradiance (W/m²) |
| `est_pv_yield_wh` | REAL | Estimated panel output for slot (Wh) |
| `cloud_cover_pct` | REAL | Cloud cover (0–100%) |

---

## Schema: Silver Layer (Cleansed & Conformed)

Deduplicated. UPSERT semantics on natural keys. Joinable across domains.

### `prices`
Canonical price intervals. Primary key: `(interval_start, channel_type)`.
- Forecasts are overwritten when actuals arrive (same interval_start).
- Indexed on `interval_start` for time-range queries.

### `telemetry`
Canonical battery telemetry. Primary key: `(recorded_at, device_sn)`.
- Power sign convention: `pv_power_w` positive = generating; `bat_power_w` positive = charging, negative = discharging; `grid_power_w` positive = importing, negative = exporting.
- Indexed on `recorded_at`.

### `solar_forecasts`
Best available solar forecast. Primary key: `slot_start`.
- Always reflects latest forecast run (newer runs overwrite older).

---

## Schema: Gold Layer (Aggregated, Analytics-Ready)

### `interval_summary_30min`
30-minute settlement-aligned energy and cost summaries.
Recomputed idempotently from Silver layer every ~5 minutes (lookback 2h).

Key columns:

| Column | Description |
|--------|-------------|
| `pv_yield_wh` | Solar energy generated |
| `battery_charged_wh` / `battery_discharged_wh` | Battery flows |
| `grid_import_wh` / `grid_export_wh` | Grid flows |
| `load_wh` | House consumption |
| `bat_soc_end` | Battery SoC at interval end |
| `avg_import_price_ckwh` | Average all-in import price |
| `avg_export_price_ckwh` | Average feed-in tariff |
| `import_cost_ac` | Cost of grid import (AUD cents) |
| `export_revenue_ac` | Feed-in revenue (AUD cents) |
| `self_consumed_wh` | Solar used on-site (not exported) |

### `daily_summary`
One row per local date (AEST/AEDT). Computed from `interval_summary_30min`.

Key columns:

| Column | Description |
|--------|-------------|
| `self_consumption_rate` | % of solar used on-site (0–1) |
| `self_sufficiency_rate` | % of load met by solar+battery (0–1) |
| `grid_import_cost_aud` | Total import cost (AUD) |
| `grid_export_revenue_aud` | Total feed-in revenue (AUD) |
| `counterfactual_cost_aud` | Cost if 100% grid at avg price |
| `total_savings_aud` | counterfactual - actual net cost |
| `spike_count` | Number of 30-min intervals with price > 30c/kWh |

---

## Schema: Operational Tables

### `optimization_decisions`
Audit trail of all optimization engine decisions.

| Column | Description |
|--------|-------------|
| `action` | `charge` \| `discharge` \| `hold` \| `auto` |
| `target_soc` | Target SoC % (for charge/discharge) |
| `charge_rate_w` | Power limit (W), null = max |
| `bat_soc_at_decision` | SoC snapshot at decision time |
| `import_price_ckwh` / `export_price_ckwh` | Prices at decision time |
| `forecast_pv_wh_4h` | 4h solar forecast at decision time |
| `reason` | Human-readable rationale |
| `applied` | 1 if command sent to inverter |
| `apply_error` | Error if inverter command failed |

### `system_config`
Key-value system configuration. Defaults seeded at migration time.

| Key | Default | Description |
|-----|---------|-------------|
| `bat_capacity_kwh` | 10.0 | Usable battery capacity |
| `bat_min_soc` | 10 | Minimum SoC reserve (%) |
| `bat_max_soc` | 95 | Maximum charge level (%) |
| `charge_threshold_ckwh` | 10.0 | Force-charge below this price |
| `discharge_threshold_ckwh` | 30.0 | Force-discharge above this price |
| `poll_interval_sec` | 60 | FoxESS poll cadence |
| `price_poll_interval_sec` | 300 | Amber poll cadence |

### `pipeline_runs`
Observability log — one row per pipeline execution.

---

## Pipeline Modules

```
data/pipeline/
  __init__.py                   — package exports
  db.py                         — connection, transaction(), run_migrations()
  amber_collector.py            — AmberCollector (Bronze + Silver)
  foxess_collector.py           — FoxESSCollector (Bronze + Silver)
  solar_forecast_collector.py   — SolarForecastCollector (Bronze + Silver)
  aggregator.py                 — Aggregator (Silver → Gold)
  analytics.py                  — Read-layer queries for API + optimizer
```

---

## Analytics API (Backend Contract)

Functions in `data/pipeline/analytics.py` expose pre-built query results.
The backend API should call these directly (they open/close their own connections).

| Function | Used By | Description |
|----------|---------|-------------|
| `get_current_state()` | Dashboard | Latest telemetry + current prices |
| `get_price_feed(hours_ahead)` | Dashboard, Optimizer | Price timeline (actuals + forecast) |
| `get_solar_forecast(hours_ahead)` | Dashboard, Optimizer | PV yield forecast |
| `get_energy_flow(hours_back)` | Dashboard | 30-min chart data |
| `get_daily_summary(date)` | Dashboard | Today's energy + savings card |
| `get_savings_report(from, to)` | Dashboard | Historical savings report |
| `get_optimization_context()` | Optimizer | All engine inputs in one call |
| `get_pipeline_health()` | Monitoring | Pipeline status + data freshness |

---

## PV Yield Estimation Model

Simple linear model in `solar_forecast_collector.py::estimate_pv_yield()`:

```
yield_Wh = GHI (W/m²) × (panel_capacity_W / 1000) × efficiency × interval_hours
```

- GHI = Global Horizontal Irradiance (Standard Test Condition = 1000 W/m²)
- Default `system_efficiency` = 0.80 (accounts for inverter, wiring, temperature, soiling)
- Configure `panel_capacity_w` and `panel_efficiency` in `system_config`

---

## Data Quality & Observability

- Every pipeline execution writes to `pipeline_runs` (start, end, status, row count, error)
- `analytics.get_pipeline_health()` exposes freshness SLAs:
  - Prices: stale if > 10 minutes old
  - Telemetry: stale if > 5 minutes old
  - Solar forecast: stale if > 120 minutes old
- All UPSERT operations are idempotent — safe to replay after failure

---

## Self-Consumption & Savings Calculations

**Self-consumption rate** = solar used on-site / total solar yield
- "On-site" = solar that powered the house or charged the battery (not exported)

**Self-sufficiency rate** = (solar self-consumed + battery discharged) / total load
- Capped at 1.0 (cannot be > 100% self-sufficient)

**Total savings (counterfactual method)**:
```
counterfactual_cost = load_kWh × avg_import_price
actual_net_cost     = import_cost − export_revenue
total_savings       = counterfactual_cost − actual_net_cost
```
This measures savings vs. a baseline of buying all electricity from the grid
at the day's average import rate.
