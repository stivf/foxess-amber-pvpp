# Battery Brain -- System Architecture

## 1. Overview

Battery Brain is a home battery management system that optimizes charge/discharge decisions for a FoxESS inverter based on real-time electricity pricing from Amber Electric, solar generation forecasts, and household consumption patterns. The goal is to maximize financial savings by charging when electricity is cheap (or from solar), holding when prices are moderate, and discharging (or exporting) when prices spike.

This is a personal/internal tool. The architecture prioritizes simplicity, maintainability by a small team, and fast iteration over scalability or multi-tenancy.

## 2. System Context Diagram

```
                         +------------------+
                         |   Amber Electric |
                         |   Pricing API    |
                         +--------+---------+
                                  |
                                  | (poll every 5 min)
                                  v
+----------------+      +--------+---------+      +------------------+
|  Weather/Solar |----->|                  |----->|  FoxESS Inverter |
|  Forecast API  |      |   Battery Brain  |      |  API             |
| (Open-Meteo)   |      |   Backend        |      |  (control + tele)|
+----------------+      |  (Python/FastAPI)|      +------------------+
                         |  +-----------+  |
                         |  | Decision  |  |
                         |  | Engine    |  |
                         |  +-----------+  |
                         |  +-----------+  |
                         |  | SQLite    |  |
                         |  | (WAL)     |  |
                         |  +-----------+  |
                         +---+------+------+
                             |      |
                     REST/WS |      | REST/WS
                      +------+      +------+
                      |                    |
               +------v------+     +------v------+
               | Web Dashboard|     | Mobile App  |
               | (Next.js)   |     | (React      |
               |             |     |  Native)    |
               +-------------+     +-------------+
```

## 3. Architecture Style: Python Modular Monolith

See [ADR-006](adrs/ADR-006-python-fastapi-backend.md) for the language decision and [ADR-001](adrs/ADR-001-modular-monolith.md) for the original monolith rationale.

The backend is a single Python application using FastAPI, organized into well-defined modules. The data pipeline, decision engine, and API server all run in the same Python process, sharing code directly. This eliminates the polyglot split (ADR-005, now superseded) and leverages official Python SDKs for all external integrations.

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.12+ |
| Web framework | FastAPI |
| ASGI server | Uvicorn |
| WebSocket | FastAPI WebSocket (built-in) |
| Validation | Pydantic v2 |
| Database | SQLite (WAL mode) via `aiosqlite` / `sqlite3` |
| FoxESS | `foxesscloud` (PyPI, official SDK) |
| Amber Electric | `amberelectric` (PyPI, official SDK) |
| Solar forecast | Open-Meteo via `httpx` |
| Scheduling | APScheduler (in-process) |
| Testing | pytest + httpx async test client |
| Dependency management | Poetry (pyproject.toml + poetry.lock) |
| Containerization | Docker + Docker Compose |

### Module Decomposition

```
src/
  api/                    # FastAPI application
    main.py               # App factory, lifespan, middleware
    routes/
      status.py           # GET /status (dashboard snapshot)
      battery.py          # Battery state + history
      pricing.py          # Current price + forecast + history
      schedule.py         # Schedule + manual override
      preferences.py      # User preferences CRUD
      profiles.py         # Aggressiveness profiles CRUD
      calendar.py         # Calendar rules + overrides CRUD
      analytics.py        # Savings reports
      notifications.py    # Push notification registration
      health.py           # Health check
    websocket.py          # WebSocket connection manager + event dispatch
    models/               # Pydantic request/response models
      battery.py
      pricing.py
      schedule.py
      preferences.py
      profiles.py
      calendar.py
      analytics.py
    dependencies.py       # FastAPI dependency injection (DB, config, services)

  pipeline/               # Data pipeline (collectors + aggregation)
    db.py                 # Connection management, transactions, migrations
    amber_collector.py    # Amber Electric ingestion (uses amberelectric SDK)
    foxess_collector.py   # FoxESS ingestion (uses foxesscloud SDK)
    solar_forecast_collector.py  # Open-Meteo ingestion (uses httpx)
    aggregator.py         # Silver -> Gold aggregation
    analytics.py          # Query functions (shared by API routes and engine)

  engine/                 # Decision engine
    optimizer.py          # Core optimization logic
    strategy.py           # Threshold calculation from price distribution
    scheduler.py          # Schedule generation (24h lookahead)
    executor.py           # FoxESS command execution via foxesscloud SDK
    profiles.py           # Profile CRUD and calendar resolution logic

  shared/                 # Cross-module utilities
    config.py             # Pydantic BaseSettings (reads env vars / .env)
    models.py             # Shared domain types
    logging.py            # Structured logging (structlog)

data/
  migrations/             # SQL migration files
  battery_brain.db        # SQLite database (created at runtime)

pyproject.toml            # Poetry project config + dependencies
poetry.lock               # Locked dependency versions
docker-compose.yml        # Development environment
Dockerfile                # Multi-stage build (dev + production)
```

### Key Design Principles

1. **Modules communicate through well-defined interfaces**, not direct imports of internal files.
2. **The decision engine is a pure function** at its core: given price forecast, solar forecast, battery state, and consumption history, it returns a schedule of charge/hold/discharge actions.
3. **External API clients use official SDKs** (`foxesscloud`, `amberelectric`) wrapped in thin adapters for testability.
4. **Pydantic models are the API contract source of truth.** FastAPI auto-generates an OpenAPI 3.1 spec, from which TypeScript types are derived for the frontend via `openapi-typescript`.

## 4. Component Details

### 4.1 Pricing Module (Amber Electric Integration)

- **SDK**: `amberelectric` (official Python SDK)
- **Polling interval**: Every 5 minutes (see [ADR-002](adrs/ADR-002-polling-for-price-data.md))
- **Cached data**: Current price, 24-hour forecast, feed-in tariff
- **Events emitted**: `price.updated`, `price.spike` (threshold-based alert)

Amber provides 30-minute interval pricing. We poll and cache locally, emitting events when significant changes occur. The price spike detection uses a configurable threshold (default: top 10% of daily forecast).

### 4.2 Solar Forecast Module

- **Data source**: Open-Meteo API (free, no API key required)
- **Polling interval**: Every 60 minutes (solar forecasts change slowly)
- **Cached data**: Hourly GHI (Global Horizontal Irradiance) forecast, converted to estimated PV yield using a linear model: `yield_Wh = GHI * (panel_capacity_W / 1000) * efficiency * interval_hours`

### 4.3 Battery Module (FoxESS Integration)

- **SDK**: `foxesscloud` (official Python SDK, v2.9.8+)
- **Telemetry polling**: Every 3 minutes (default, configurable, min 2 min). See [ADR-008](adrs/ADR-008-foxess-rate-limiting.md) for rate limit rationale.
- **Commands**: Set charge mode, set discharge mode, set hold, adjust min SoC
- **Rate limit**: FoxESS enforces 1,440 API calls/day. A budget tracker reserves 200 calls for commands, throttles telemetry adaptively, and provides graceful degradation when budget is exhausted.
- **Safety constraints**: Never discharge below configurable min SoC (default: 20%), respect FoxESS rate limits

### 4.4 Decision Engine

The core optimization module. It runs on a configurable cycle (default: every 15 minutes) and produces a charge/discharge schedule for the next 24 hours.

**Inputs:**
- Current battery state (SoC, capacity, charge/discharge rate limits)
- Price forecast (next 24h, 30-min intervals)
- Solar generation forecast (next 24h, hourly)
- Historical household consumption pattern (hourly average by day-of-week)
- **Active aggressiveness profile** (resolved from calendar for each time slot)
- User preferences (min SoC, notification settings)

**Output:**
- A schedule of time slots with actions: `CHARGE`, `HOLD`, `DISCHARGE`, `AUTO`
- Expected savings estimate
- Which profile was active for each slot

**Aggressiveness profiles** control three dimensions of the optimizer's behavior:

| Parameter | Range | Effect |
|-----------|-------|--------|
| `export_aggressiveness` | 0.0 - 1.0 | How eagerly to sell to grid. 0 = never export, 0.5 = moderate (export during spikes), 1.0 = export whenever profitable. Shifts the discharge price threshold down. |
| `preservation_aggressiveness` | 0.0 - 1.0 | How much battery to keep in reserve. 0 = use all available capacity, 0.5 = moderate reserve, 1.0 = maximum preservation (high effective min SoC). Scales the effective min SoC upward. |
| `import_aggressiveness` | 0.0 - 1.0 | How eagerly to charge from grid. 0 = only charge from solar, 0.5 = charge during cheap periods, 1.0 = aggressively charge whenever below threshold. Shifts the charge price threshold up. |

**Calendar-based profile scheduling** allows different profiles to be active at different times:
- A **default profile** applies when no calendar rule matches
- **Recurring rules** activate profiles on a schedule (e.g., weekdays 4-8pm = aggressive export)
- **One-off overrides** apply to specific date/time ranges (e.g., next Tuesday = preserve battery)
- Resolution priority: one-off override > recurring rule > default profile

See section 4.4.1 for the calendar resolution algorithm.

**Algorithm (MVP):**
1. For each 30-min slot in the next 24h:
   - **Resolve active profile** for this slot (calendar lookup)
   - Compute effective thresholds from profile aggressiveness values:
     - `charge_threshold = base_charge_threshold * (1 + import_aggressiveness)`
     - `discharge_threshold = base_discharge_threshold * (1 - export_aggressiveness * 0.5)`
     - `effective_min_soc = base_min_soc + (100 - base_min_soc) * preservation_aggressiveness * 0.5`
   - Estimate net load = consumption forecast - solar forecast
   - If price < charge_threshold AND battery not full: CHARGE
   - If price > discharge_threshold AND battery above effective_min_soc: DISCHARGE
   - If price is in spike territory and net load is negative (excess solar): EXPORT
   - Otherwise: HOLD (let solar charge naturally)
2. Base thresholds are derived from the price forecast distribution (percentiles)
3. The schedule is re-evaluated every 15 minutes as new price/solar data arrives

### 4.4.1 Calendar Resolution

The decision engine resolves the active profile for each time slot using this priority:

```
1. Check one-off overrides for exact datetime match
   -> If found, use that profile
2. Check recurring rules (day-of-week + time range match)
   -> If multiple match, use the one with the highest priority value
3. Fall back to the default profile
```

**Data model:**

```sql
-- Aggressiveness profiles
CREATE TABLE IF NOT EXISTS profiles (
    id                          TEXT NOT NULL PRIMARY KEY,  -- UUID or slug
    name                        TEXT NOT NULL,
    export_aggressiveness       REAL NOT NULL DEFAULT 0.5,  -- 0.0-1.0
    preservation_aggressiveness REAL NOT NULL DEFAULT 0.5,  -- 0.0-1.0
    import_aggressiveness       REAL NOT NULL DEFAULT 0.5,  -- 0.0-1.0
    is_default                  INTEGER NOT NULL DEFAULT 0, -- 1 for the default profile
    created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Recurring calendar rules (e.g., every weekday 4-8pm)
CREATE TABLE IF NOT EXISTS calendar_rules (
    id              TEXT NOT NULL PRIMARY KEY,  -- UUID
    profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    days_of_week    TEXT NOT NULL,   -- JSON array: [0,1,2,3,4] (Mon-Fri) or [5,6] (Sat-Sun)
    start_time      TEXT NOT NULL,   -- HH:MM local time
    end_time        TEXT NOT NULL,   -- HH:MM local time
    priority        INTEGER NOT NULL DEFAULT 0,  -- higher = wins ties
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- One-off overrides (e.g., next Tuesday all day)
CREATE TABLE IF NOT EXISTS calendar_overrides (
    id              TEXT NOT NULL PRIMARY KEY,  -- UUID
    profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    start_datetime  TEXT NOT NULL,   -- ISO8601 local datetime
    end_datetime    TEXT NOT NULL,   -- ISO8601 local datetime
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

**Future enhancements:**
- Linear programming optimization for globally optimal schedule
- ML-based consumption prediction
- Multi-day lookahead for weather patterns

### 4.5 Telemetry and Storage

See [ADR-004](adrs/ADR-004-data-storage.md) for storage decisions.

**Storage:** Single SQLite database (`data/battery_brain.db`) with WAL mode for concurrent read/write access. Data is organized in a three-layer Medallion architecture:

- **Bronze (raw, append-only):** `raw_amber_prices`, `raw_foxess_telemetry`, `raw_solar_forecasts` -- full audit trail, never modified after insert
- **Silver (cleansed, deduplicated):** `prices`, `telemetry`, `solar_forecasts` -- UPSERT semantics, indexed for time-range queries
- **Gold (aggregated):** `interval_summary_30min` (aligns with Amber settlement periods), `daily_summary` -- pre-computed analytics for dashboard
- **Operational:** `optimization_decisions`, `system_config`, `pipeline_runs`, `foxess_api_budget`
- **Profiles:** `profiles`, `calendar_rules`, `calendar_overrides`

**Data pipeline:** Python modules in `src/pipeline/` handle ingestion (Bronze + Silver) and aggregation (Silver -> Gold). The aggregation pipeline runs after each collection cycle with a 2-hour idempotent lookback window. The API routes call the same `analytics.py` query functions directly -- no duplication.

**Retention:**
- Bronze (raw) tables: 90 days
- Silver tables: 1 year
- Gold aggregates: indefinite
- Price history: indefinite

### 4.6 API Layer

See [API_CONTRACT.md](API_CONTRACT.md) for the full API specification.

- **Framework**: FastAPI with Pydantic v2 models for request/response validation
- **REST API**: CRUD for preferences, historical data queries, schedule management
- **WebSocket**: Real-time updates for battery state, current price, active schedule
- **OpenAPI spec**: Auto-generated at `/openapi.json`, used to derive frontend TypeScript types
- **Shared backend for web + mobile**: See [ADR-003](adrs/ADR-003-shared-backend.md)

### 4.7 Scheduler

APScheduler (in-process) manages all periodic tasks:
- Decision engine cycle (every 15 min)
- Price data polling (every 5 min) via `amberelectric` SDK
- Solar forecast polling (every 60 min) via Open-Meteo
- Battery telemetry polling (every 3 min, adaptive) via `foxesscloud` SDK -- see [ADR-008](adrs/ADR-008-foxess-rate-limiting.md)
- Daily analytics aggregation (midnight)
- Data retention cleanup (daily)
- FoxESS API budget reset (midnight UTC)

No external job queue needed for a single-instance deployment. APScheduler runs within the FastAPI lifespan context.

### 4.8 FoxESS API Rate Limiting

See [ADR-008](adrs/ADR-008-foxess-rate-limiting.md) for the full strategy.

FoxESS enforces a hard limit of **1,440 API calls/day**. The system manages this via:

- **Budget tracker**: Counts all FoxESS API calls, persisted to SQLite (`foxess_api_budget` table). Survives process restarts.
- **Command reservation**: 200 calls always reserved for charge/discharge/hold commands. Telemetry polling is throttled before commands are affected.
- **Adaptive polling**: Normal = 3 min, price spike = 90 sec, budget warning (>80%) = 5 min, budget critical (>95%) = suspended.
- **Graceful degradation**: When budget is exhausted, dashboard shows last known state with a stale indicator. Commands are suspended only at the hard limit.

**Daily budget at default 3-minute polling:**

| Activity | Calls/day | % of budget |
|----------|-----------|-------------|
| Telemetry polling | 480 | 33% |
| Decision engine commands | ~96 | 7% |
| **Reserve + headroom** | **864** | **60%** |

## 5. Data Flow

### 5.1 Decision Cycle (every 15 minutes)

```
1. APScheduler triggers decision cycle
2. pipeline.analytics.get_optimization_context() returns all inputs:
   - Cached price forecast from Silver layer
   - Solar generation forecast from Silver layer
   - Current battery SoC from Silver layer
   - Historical consumption pattern from Gold layer
3. Decision engine computes optimal schedule
4. Schedule is persisted to optimization_decisions table (audit trail)
5. executor.py sends commands to FoxESS via foxesscloud SDK
6. WebSocket manager pushes updated schedule to connected clients
```

### 5.2 Real-Time Dashboard Updates

```
1. Client connects via WebSocket
2. Server sends initial state snapshot (battery, price, schedule)
3. On each telemetry poll (~3 min, adaptive), server pushes battery state update
4. On price update (5min), server pushes new price data
5. On schedule change (15min or manual override), server pushes new schedule
```

## 6. Deployment

See [ADR-007](adrs/ADR-007-docker-deployment.md) for the Docker decision.

### Development

```bash
docker compose up        # Starts backend (FastAPI + Uvicorn with hot reload)
```

The `docker-compose.yml` mounts `src/` for hot reload and `data/` for SQLite persistence. Environment variables (API keys) are loaded from `.env`.

### Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

Single machine (Raspberry Pi, home server, or small cloud VM):
- Docker container running FastAPI backend (Python 3.12, Uvicorn, single worker)
- SQLite database file bind-mounted from host (`data/battery_brain.db`)
- Reverse proxy (Caddy/nginx) for HTTPS termination
- Next.js web dashboard deployed as static build or via Vercel/Netlify
- Mobile app distributed via TestFlight / side-load

### Backup

Copy the SQLite database file. That's the entire state.

## 7. Security Considerations

- API keys for FoxESS and Amber stored in environment variables (never in code or Docker images)
- Backend API uses a simple API key for auth (single-user, no complex auth needed)
- WebSocket connections authenticated on handshake
- HTTPS enforced in production (via reverse proxy)
- FoxESS commands are rate-limited and validated before sending
- Pydantic models validate all incoming request data at the API boundary

## 8. Cross-Cutting Concerns

### Type Sharing (Backend -> Frontend)

The backend (Python/Pydantic) is the source of truth for API types. The workflow:

1. FastAPI auto-generates OpenAPI 3.1 spec at `/openapi.json`
2. `openapi-typescript` generates TypeScript types from the spec
3. Web dashboard (Next.js) and mobile app (React Native) import generated types
4. CI regenerates types on backend changes to prevent drift

This replaces the original `@battery-brain/shared` hand-maintained TypeScript package with an automated, always-in-sync approach.

### Observability
- Structured logging via `structlog` with JSON output
- Key metrics: decision engine latency, API call success rates, battery SoC over time
- Health check endpoint (`GET /health`) reports status of all external API connections
- Pipeline observability via `pipeline_runs` table (freshness SLAs, error tracking)

### Error Handling
- External API failures: Circuit breaker pattern with graceful degradation
- If pricing data unavailable: Hold current schedule, alert user
- If FoxESS API unavailable: Revert to AUTO mode, alert user
- If FoxESS API budget exhausted: Use last known state, suspend polling, alert user. Commands suspended only at hard limit. See [ADR-008](adrs/ADR-008-foxess-rate-limiting.md).
- All errors logged with context for debugging
- FastAPI exception handlers return consistent error response format

### Testing Strategy
- Decision engine: Unit tests with fixture data (price curves, solar forecasts)
- API clients: Integration tests against recorded responses (`pytest-recording` / VCR)
- API layer: Integration tests via `httpx` async test client
- Pipeline: Unit tests for collectors and aggregation with test SQLite databases
- End-to-end: Manual testing against real APIs in dev mode

## 9. Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](adrs/ADR-001-modular-monolith.md) | Modular Monolith Architecture | Superseded by ADR-006 |
| [ADR-002](adrs/ADR-002-polling-for-price-data.md) | Polling for Price Data | Accepted |
| [ADR-003](adrs/ADR-003-shared-backend.md) | Shared Backend for Web and Mobile | Accepted |
| [ADR-004](adrs/ADR-004-data-storage.md) | Data Storage Strategy | Accepted (revised) |
| [ADR-005](adrs/ADR-005-polyglot-split.md) | Polyglot Split: Python Pipeline + Node.js API | Superseded by ADR-006 |
| [ADR-006](adrs/ADR-006-python-fastapi-backend.md) | Python/FastAPI Backend | Accepted |
| [ADR-007](adrs/ADR-007-docker-deployment.md) | Docker-Based Deployment | Accepted |
| [ADR-008](adrs/ADR-008-foxess-rate-limiting.md) | FoxESS API Rate Limit Strategy | Accepted |
