-- ============================================================
-- battery-brain: Migration 002
-- Description: Add foxess_api_budget table for daily API call
--              tracking and rate limit enforcement (ADR-008).
-- ============================================================

-- Daily API call budget tracker.
-- One row per UTC date. Persisted so counts survive process restarts.
-- The budget tracker module reads/writes this table on every FoxESS API call.
CREATE TABLE IF NOT EXISTS foxess_api_budget (
    date        TEXT    NOT NULL PRIMARY KEY,  -- YYYY-MM-DD UTC
    calls_used  INTEGER NOT NULL DEFAULT 0,    -- total calls (poll + cmd)
    calls_poll  INTEGER NOT NULL DEFAULT 0,    -- telemetry poll calls
    calls_cmd   INTEGER NOT NULL DEFAULT 0,    -- control command calls
    last_call   TEXT                           -- ISO8601 UTC timestamp of last call
);
