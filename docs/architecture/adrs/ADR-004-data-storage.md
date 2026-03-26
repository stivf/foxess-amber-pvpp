# ADR-004: Data Storage Strategy

## Status

Accepted (revised 2026-03-25 -- changed from SQLite+TimescaleDB to SQLite-only after implementation review)

## Context

Battery Brain needs to store several categories of data:
1. **Configuration and preferences**: User settings, thresholds, system config (small, relational, rarely changing)
2. **Time-series telemetry**: Battery SoC, power flow, grid import/export -- sampled every 60 seconds (high-volume, append-heavy, time-range queries)
3. **Price history**: Amber Electric price data at 5-minute intervals (moderate volume, time-range queries)
4. **Decision audit log**: What the decision engine decided and why (moderate volume, append-only)
5. **Analytics aggregations**: Hourly/daily savings, consumption, generation summaries (derived, query-heavy)

Key considerations:
- Must run on modest hardware (Raspberry Pi or small VM)
- Operational simplicity is paramount -- fewer moving parts is better
- Time-series queries (e.g., "show me battery SoC for the last 24 hours") must be fast
- Data retention spans months to years for analytics

## Options Considered

### Option A: SQLite only with Medallion architecture (selected)

Store everything in a single SQLite database. Use a three-layer Medallion architecture (Bronze -> Silver -> Gold) with pre-computed aggregates to compensate for SQLite's lack of native time-series features.

**Pros:** Zero operational overhead. Single file. No external dependencies. WAL mode enables concurrent reads during writes. Pre-computed Gold layer aggregates (30-min, daily) avoid expensive ad-hoc queries over raw telemetry. Trivial backup (copy one file). Runs on any hardware including Raspberry Pi with no tuning.
**Cons:** No automatic time-partitioning or compression. Must manually manage data retention (DELETE old rows). No continuous aggregates -- must re-run aggregation pipeline. Performance may degrade after years of raw telemetry accumulation (mitigated by retention policy and indexed time columns).

### Option B: SQLite + TimescaleDB (original decision, superseded)

Use SQLite for configuration/preferences and TimescaleDB (PostgreSQL extension) for time-series data.

**Pros:** Each storage engine is used for its strength. TimescaleDB provides automatic time-partitioning, compression, and continuous aggregates -- purpose-built for this workload.
**Cons:** Two databases to manage. TimescaleDB requires PostgreSQL, adding ~100-200MB memory baseline. Docker dependency for TimescaleDB. Overkill for a single-user system that generates ~1440 telemetry rows/day (~525K/year).

### Option C: SQLite + InfluxDB

**Pros:** InfluxDB is purpose-built for metrics and telemetry.
**Cons:** Non-SQL query language. Extra infrastructure. Same operational overhead concerns as Option B.

## Decision

**Option A: SQLite only with Medallion architecture.**

The original decision (Option B) was revised after the data engineer demonstrated that the actual data volumes for a single-user home battery system are modest (~175K telemetry rows/year at 3-minute polling, ~105K price rows/year). SQLite with WAL mode, proper indexing, and pre-computed aggregates handles this comfortably. The Medallion architecture (Bronze/Silver/Gold) provides the data quality and query performance benefits without the operational cost of a second database.

### Architecture: Medallion Layers

**Bronze (raw, append-only):** `raw_amber_prices`, `raw_foxess_telemetry`, `raw_solar_forecasts`
- Never modified after insert. Full audit trail of all ingested data.

**Silver (cleansed, deduplicated):** `prices`, `telemetry`, `solar_forecasts`
- UPSERT semantics on natural keys. Forecasts overwritten when actuals arrive.
- Indexed on time columns for efficient range queries.

**Gold (aggregated, analytics-ready):** `interval_summary_30min`, `daily_summary`
- 30-minute intervals align with Amber settlement periods.
- Recomputed idempotently from Silver layer (2h lookback window).
- Pre-computed savings using counterfactual method (vs 100% grid baseline).

**Operational:** `optimization_decisions`, `system_config`, `pipeline_runs`

### Data volume estimate

| Table | Row rate | Annual rows | ~Size/year |
|-------|----------|-------------|------------|
| raw_foxess_telemetry | 1/3min | 175,200 | ~17 MB |
| raw_amber_prices | 1/5min | 105,120 | ~10 MB |
| raw_solar_forecasts | 1/hr (48 slots) | ~420,480 | ~30 MB |
| interval_summary_30min | 48/day | 17,520 | ~2 MB |
| daily_summary | 1/day | 365 | <1 MB |

Total: ~60 MB/year. Well within SQLite's comfort zone.

### Retention policy
- Bronze (raw) tables: 90 days, then purged by scheduled job
- Silver tables: 1 year
- Gold aggregates: indefinite (tiny volume)
- Price history: indefinite
- Decision logs: 1 year

### Sign convention (project-wide standard)
- `bat_power_w`: positive = charging, negative = discharging
- `grid_power_w`: positive = import, negative = export
- `pv_power_w`: always positive (generation)
- `load_power_w`: always positive (consumption)

## Consequences

**What becomes easier:**
- Single-file database. Backup = copy file. No Docker, no PostgreSQL, no memory tuning.
- Deploys on Raspberry Pi with zero infrastructure setup.
- One migration system, one connection pool, one query language.
- Bronze layer provides full audit trail for debugging data quality issues.
- Gold layer pre-computes dashboard analytics -- API queries hit aggregated tables, not raw telemetry.

**What becomes harder:**
- Must manually schedule aggregation pipeline (no continuous aggregates).
- Must manually purge old data (no automatic retention policies).
- If data volumes grow unexpectedly (e.g., sub-second telemetry), SQLite may struggle (extremely unlikely for this use case).
- No built-in compression -- relies on filesystem-level solutions if storage becomes a concern.
