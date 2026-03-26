-- ============================================================
-- battery-brain: Initial Schema Migration
-- Version: 001
-- Description: Core time-series tables for Amber Electric prices,
--              FoxESS battery telemetry, solar forecasts, and
--              aggregated analytics.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─────────────────────────────────────────────────────────────
-- BRONZE LAYER: Raw ingested data — append-only, never modified
-- ─────────────────────────────────────────────────────────────

-- Raw Amber Electric price intervals (5-min dispatch, 30-min settlement)
CREATE TABLE IF NOT EXISTS raw_amber_prices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ingested_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    source_url          TEXT,

    -- Amber price interval fields
    interval_start      TEXT    NOT NULL,   -- ISO8601 UTC e.g. "2026-03-25T10:00:00Z"
    interval_end        TEXT    NOT NULL,   -- ISO8601 UTC
    interval_type       TEXT    NOT NULL,   -- 'ActualInterval' | 'ForecastInterval' | 'CurrentInterval'
    channel_type        TEXT    NOT NULL,   -- 'general' | 'feedIn' | 'controlledLoad'
    spot_per_kwh        REAL    NOT NULL,   -- c/kWh, raw spot price
    per_kwh             REAL    NOT NULL,   -- c/kWh, all-in price (includes network, etc.)
    renewables          REAL,               -- 0–100, % renewable generation in grid
    spike_status        TEXT,               -- 'none' | 'potential' | 'spike'
    descriptor          TEXT,               -- 'veryLow' | 'low' | 'neutral' | 'high' | 'spike' | 'extremelyHigh'
    estimate            INTEGER NOT NULL DEFAULT 0,  -- 1 if forecast/estimate, 0 if actual
    tariff_information  TEXT,               -- JSON blob of tariff breakdown
    range_json          TEXT                -- JSON: {min, max} price range for forecast intervals
);

CREATE INDEX IF NOT EXISTS idx_raw_amber_prices_interval
    ON raw_amber_prices (interval_start, channel_type);

-- Raw FoxESS device telemetry (SoC, power flows)
CREATE TABLE IF NOT EXISTS raw_foxess_telemetry (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ingested_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    device_sn           TEXT    NOT NULL,   -- FoxESS inverter serial number

    -- Timestamps
    device_time         TEXT    NOT NULL,   -- timestamp from device (local time as reported)
    device_time_utc     TEXT    NOT NULL,   -- UTC normalised

    -- Power flows (all in watts, signed: positive = generating/charging)
    pv_power_w          REAL    NOT NULL DEFAULT 0,   -- solar generation from panels
    bat_power_w         REAL    NOT NULL DEFAULT 0,   -- battery: +charge, -discharge
    grid_power_w        REAL    NOT NULL DEFAULT 0,   -- grid: +import, -export
    load_power_w        REAL    NOT NULL DEFAULT 0,   -- house load (consumption)
    eps_power_w         REAL    NOT NULL DEFAULT 0,   -- EPS/backup power (if active)

    -- Battery state
    bat_soc             REAL    NOT NULL,   -- State of Charge, 0–100 %
    bat_temp_c          REAL,               -- battery temperature (°C)
    bat_voltage_v       REAL,               -- battery voltage (V)
    bat_current_a       REAL,               -- battery current (A)

    -- Inverter state
    inv_temp_c          REAL,               -- inverter temperature (°C)
    grid_voltage_v      REAL,               -- grid voltage (V)
    grid_freq_hz        REAL,               -- grid frequency (Hz)
    work_mode           TEXT,               -- 'Self Use' | 'Feed-in First' | 'Backup' | 'Force Charge' | 'Force Discharge'

    -- Accumulated energy counters (kWh, lifetime totals from device)
    today_yield_kwh     REAL,               -- solar yield today
    today_charge_kwh    REAL,               -- battery charged today
    today_discharge_kwh REAL,               -- battery discharged today
    today_import_kwh    REAL,               -- grid import today
    today_export_kwh    REAL                -- grid export today
);

CREATE INDEX IF NOT EXISTS idx_raw_foxess_telemetry_time
    ON raw_foxess_telemetry (device_time_utc, device_sn);

-- Raw solar irradiance forecasts (from Open-Meteo or Solcast)
CREATE TABLE IF NOT EXISTS raw_solar_forecasts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ingested_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    forecast_source     TEXT    NOT NULL,   -- 'open-meteo' | 'solcast' | 'bom'
    forecast_run_time   TEXT    NOT NULL,   -- when this forecast was generated (UTC)

    -- Forecast slot
    slot_start          TEXT    NOT NULL,   -- UTC ISO8601
    slot_end            TEXT    NOT NULL,   -- UTC ISO8601
    interval_minutes    INTEGER NOT NULL DEFAULT 30,

    -- Irradiance (W/m²)
    ghi_wm2             REAL,               -- Global Horizontal Irradiance
    dni_wm2             REAL,               -- Direct Normal Irradiance
    dhi_wm2             REAL,               -- Diffuse Horizontal Irradiance

    -- Derived PV yield estimate (Wh) — optional, computed by pipeline
    est_pv_yield_wh     REAL,               -- estimated panel output for this slot

    -- Cloud/weather
    cloud_cover_pct     REAL,               -- 0–100%
    temp_c              REAL                -- ambient temperature (°C)
);

CREATE INDEX IF NOT EXISTS idx_raw_solar_forecasts_slot
    ON raw_solar_forecasts (slot_start, forecast_source);

-- ─────────────────────────────────────────────────────────────
-- SILVER LAYER: Cleansed, conformed, deduplicated
-- ─────────────────────────────────────────────────────────────

-- Canonical 5-minute price intervals (general channel, actual + forecast)
CREATE TABLE IF NOT EXISTS prices (
    interval_start      TEXT    NOT NULL,
    channel_type        TEXT    NOT NULL,   -- 'general' | 'feedIn' | 'controlledLoad'
    is_forecast         INTEGER NOT NULL DEFAULT 0,  -- 0=actual, 1=forecast

    spot_per_kwh        REAL    NOT NULL,   -- c/kWh spot
    per_kwh             REAL    NOT NULL,   -- c/kWh all-in (what you pay/receive)
    renewables          REAL,               -- % renewables 0–100
    spike_status        TEXT    NOT NULL DEFAULT 'none',
    descriptor          TEXT,

    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    PRIMARY KEY (interval_start, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_prices_start ON prices (interval_start);

-- Canonical battery telemetry at native poll interval (typically 1–5 min)
CREATE TABLE IF NOT EXISTS telemetry (
    recorded_at         TEXT    NOT NULL,   -- UTC ISO8601, rounded to poll interval
    device_sn           TEXT    NOT NULL,

    pv_power_w          REAL    NOT NULL DEFAULT 0,
    bat_power_w         REAL    NOT NULL DEFAULT 0,
    grid_power_w        REAL    NOT NULL DEFAULT 0,
    load_power_w        REAL    NOT NULL DEFAULT 0,

    bat_soc             REAL    NOT NULL,
    bat_temp_c          REAL,
    work_mode           TEXT,

    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    PRIMARY KEY (recorded_at, device_sn)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_recorded ON telemetry (recorded_at);

-- Canonical solar forecast (best available, 30-min slots)
CREATE TABLE IF NOT EXISTS solar_forecasts (
    slot_start          TEXT    NOT NULL PRIMARY KEY,
    slot_end            TEXT    NOT NULL,
    forecast_source     TEXT    NOT NULL,
    forecast_run_time   TEXT    NOT NULL,   -- so consumers know freshness

    ghi_wm2             REAL,
    est_pv_yield_wh     REAL    NOT NULL DEFAULT 0,
    cloud_cover_pct     REAL,
    temp_c              REAL,

    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- GOLD LAYER: Aggregated business metrics
-- ─────────────────────────────────────────────────────────────

-- 30-minute interval summaries (aligns with Amber settlement periods)
CREATE TABLE IF NOT EXISTS interval_summary_30min (
    interval_start      TEXT    NOT NULL PRIMARY KEY,  -- UTC, on 30-min boundary
    interval_end        TEXT    NOT NULL,

    -- Energy flows (Wh per interval)
    pv_yield_wh         REAL    NOT NULL DEFAULT 0,
    battery_charged_wh  REAL    NOT NULL DEFAULT 0,
    battery_discharged_wh REAL  NOT NULL DEFAULT 0,
    grid_import_wh      REAL    NOT NULL DEFAULT 0,
    grid_export_wh      REAL    NOT NULL DEFAULT 0,
    load_wh             REAL    NOT NULL DEFAULT 0,

    -- Battery state (snapshot at interval end)
    bat_soc_end         REAL,

    -- Prices (c/kWh, average across interval)
    avg_import_price_ckwh  REAL,
    avg_export_price_ckwh  REAL,
    avg_spot_price_ckwh    REAL,
    avg_renewables_pct     REAL,

    -- Cost/revenue (AUD cents)
    import_cost_ac      REAL    NOT NULL DEFAULT 0,   -- cost of grid import
    export_revenue_ac   REAL    NOT NULL DEFAULT 0,   -- revenue from export

    -- Self-consumption
    self_consumed_wh    REAL    NOT NULL DEFAULT 0,   -- pv used directly (not exported)

    computed_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_interval_30min_start ON interval_summary_30min (interval_start);

-- Daily aggregates for dashboard savings reports
CREATE TABLE IF NOT EXISTS daily_summary (
    date                TEXT    NOT NULL PRIMARY KEY,  -- YYYY-MM-DD (local date, AEST/AEDT)

    -- Energy (kWh)
    pv_yield_kwh        REAL    NOT NULL DEFAULT 0,
    battery_charged_kwh REAL    NOT NULL DEFAULT 0,
    battery_discharged_kwh REAL NOT NULL DEFAULT 0,
    grid_import_kwh     REAL    NOT NULL DEFAULT 0,
    grid_export_kwh     REAL    NOT NULL DEFAULT 0,
    load_kwh            REAL    NOT NULL DEFAULT 0,

    -- Self-consumption & self-sufficiency rates (0–1)
    self_consumption_rate REAL  NOT NULL DEFAULT 0,   -- pv_self_used / pv_yield
    self_sufficiency_rate REAL  NOT NULL DEFAULT 0,   -- self_used / load

    -- Cost/savings (AUD, not cents)
    grid_import_cost_aud    REAL NOT NULL DEFAULT 0,
    grid_export_revenue_aud REAL NOT NULL DEFAULT 0,
    -- counterfactual: what grid import would have cost without battery/solar
    counterfactual_cost_aud REAL NOT NULL DEFAULT 0,
    total_savings_aud       REAL NOT NULL DEFAULT 0,   -- counterfactual - actual net cost

    -- Price stats
    avg_import_price_ckwh   REAL,
    avg_export_price_ckwh   REAL,
    peak_import_price_ckwh  REAL,
    peak_export_price_ckwh  REAL,
    spike_count             INTEGER NOT NULL DEFAULT 0,

    computed_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- OPTIMIZATION ENGINE: Inputs & decision audit trail
-- ─────────────────────────────────────────────────────────────

-- Optimization decisions made by the engine
CREATE TABLE IF NOT EXISTS optimization_decisions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    decided_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    valid_from          TEXT    NOT NULL,   -- when to apply this decision
    valid_until         TEXT    NOT NULL,   -- when it expires (next decision cycle)

    device_sn           TEXT    NOT NULL,

    -- Decision
    action              TEXT    NOT NULL,   -- 'charge' | 'discharge' | 'hold' | 'auto'
    target_soc          REAL,              -- target SoC % (for charge/discharge modes)
    charge_rate_w       REAL,              -- charge/discharge rate (W), null = max

    -- Inputs at decision time (snapshot for auditability)
    bat_soc_at_decision REAL    NOT NULL,
    import_price_ckwh   REAL    NOT NULL,
    export_price_ckwh   REAL    NOT NULL,
    forecast_pv_wh_4h   REAL,              -- 4h solar forecast
    forecast_load_wh_4h REAL,              -- 4h load forecast

    -- Decision rationale
    reason              TEXT,              -- human-readable explanation
    engine_version      TEXT,              -- optimizer version for debugging

    -- Execution tracking
    applied             INTEGER NOT NULL DEFAULT 0,   -- 1 if sent to inverter
    applied_at          TEXT,
    apply_error         TEXT               -- error message if apply failed
);

CREATE INDEX IF NOT EXISTS idx_decisions_valid
    ON optimization_decisions (valid_from, valid_until);

-- System config & preferences (key-value)
CREATE TABLE IF NOT EXISTS system_config (
    key                 TEXT    NOT NULL PRIMARY KEY,
    value               TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    description         TEXT
);

-- Seed default config
INSERT OR IGNORE INTO system_config (key, value, description) VALUES
    ('device_sn',           '',       'FoxESS inverter serial number'),
    ('site_id',             '',       'Amber Electric site ID'),
    ('timezone',            'Australia/Brisbane', 'Local timezone for date aggregation'),
    ('bat_capacity_kwh',    '10.0',   'Usable battery capacity (kWh)'),
    ('bat_min_soc',         '10',     'Minimum SoC % to maintain (reserve)'),
    ('bat_max_soc',         '95',     'Maximum SoC % to charge to'),
    ('panel_capacity_w',    '6600',   'Total PV panel capacity (W)'),
    ('panel_efficiency',    '0.80',   'System efficiency factor for PV yield estimate'),
    ('charge_threshold_ckwh', '10.0', 'Import price below which to force-charge (c/kWh)'),
    ('discharge_threshold_ckwh', '30.0', 'Export price above which to force-discharge (c/kWh)'),
    ('poll_interval_sec',   '180',    'FoxESS telemetry poll interval (seconds) — 480 calls/day at 3 min, within 1440/day limit'),
    ('price_poll_interval_sec', '300','Amber price poll interval (seconds)'),
    -- FoxESS API budget thresholds (ADR-008)
    ('foxess_daily_limit',        '1440', 'FoxESS Cloud API hard limit: calls per day'),
    ('foxess_command_reserve',    '200',  'Calls reserved for control commands; telemetry stops when remaining < this'),
    ('foxess_warning_threshold',  '0.80', 'Budget fraction at which to alert and reduce poll frequency'),
    ('foxess_critical_threshold', '0.95', 'Budget fraction at which to suspend telemetry polling entirely');

-- Pipeline run log for observability
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline            TEXT    NOT NULL,  -- 'amber_prices' | 'foxess_telemetry' | 'solar_forecast' | 'aggregation'
    started_at          TEXT    NOT NULL,
    finished_at         TEXT,
    status              TEXT    NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'failed'
    rows_ingested       INTEGER,
    rows_processed      INTEGER,
    error_message       TEXT,
    details_json        TEXT,              -- JSON blob for extra metadata
    pipeline_version    TEXT               -- semver of pipeline code that produced this run
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline
    ON pipeline_runs (pipeline, started_at DESC);
