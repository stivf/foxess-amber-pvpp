-- ============================================================
-- battery-brain: Migration 003
-- Description: Aggressiveness profiles and calendar scheduling
--              tables for the decision engine (ADR-006 §4.4.1).
-- ============================================================

-- Optimisation profiles (export/preservation/import aggressiveness 0–1)
CREATE TABLE IF NOT EXISTS profiles (
    id                          TEXT    NOT NULL PRIMARY KEY,
    name                        TEXT    NOT NULL,
    export_aggressiveness       REAL    NOT NULL DEFAULT 0.5,  -- 0=conservative, 1=aggressive export
    preservation_aggressiveness REAL    NOT NULL DEFAULT 0.5,  -- 0=use battery freely, 1=preserve charge
    import_aggressiveness       REAL    NOT NULL DEFAULT 0.5,  -- 0=avoid grid import, 1=charge from grid freely
    is_default                  INTEGER NOT NULL DEFAULT 0,    -- 1 = active when no calendar rule applies
    created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Recurring weekly calendar rules — map time windows to a profile
CREATE TABLE IF NOT EXISTS calendar_rules (
    id              TEXT    NOT NULL PRIMARY KEY,
    profile_id      TEXT    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    days_of_week    TEXT    NOT NULL,  -- JSON array of ints: [0=Mon .. 6=Sun], e.g. "[0,1,2,3,4]"
    start_time      TEXT    NOT NULL,  -- HH:MM (local time)
    end_time        TEXT    NOT NULL,  -- HH:MM (local time)
    priority        INTEGER NOT NULL DEFAULT 0,    -- higher = wins on overlap
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_rules_profile
    ON calendar_rules (profile_id, enabled);

-- One-off date/time overrides — take priority over recurring rules
CREATE TABLE IF NOT EXISTS calendar_overrides (
    id              TEXT    NOT NULL PRIMARY KEY,
    profile_id      TEXT    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    start_datetime  TEXT    NOT NULL,  -- ISO8601 local datetime, e.g. "2026-03-25T18:00:00"
    end_datetime    TEXT    NOT NULL,  -- ISO8601 local datetime
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_overrides_window
    ON calendar_overrides (start_datetime, end_datetime);

-- Seed the default balanced profile
INSERT OR IGNORE INTO profiles (id, name, is_default) VALUES ('prof_default', 'Balanced', 1);
