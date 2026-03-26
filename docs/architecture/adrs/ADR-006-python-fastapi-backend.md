# ADR-006: Python/FastAPI Backend

## Status

Accepted (supersedes ADR-001 Node.js monolith and ADR-005 polyglot split)

## Context

ADR-001 specified a Node.js/TypeScript monolith. ADR-005 accepted a polyglot split after the data pipeline was built in Python. During implementation, it became clear that the Node.js choice created friction:

1. **No mature Node.js SDKs for our core integrations.** FoxESS has an official Python library (`foxesscloud` on PyPI, v2.9.8) handling authentication, rate limiting, and device control. Amber Electric has an official Python SDK (`amberelectric` on PyPI). None of these have meaningful Node.js equivalents -- we would need to write and maintain custom API clients from scratch.

2. **The data pipeline is already Python.** The Medallion architecture (Bronze/Silver/Gold), collectors, aggregation pipeline, and analytics queries are all implemented in Python. ADR-005 accepted a polyglot split, but this meant duplicating analytics queries in TypeScript for the API layer.

3. **Single language simplifies everything.** One runtime to install, one set of dependencies, one testing framework, shared code between pipeline and API. The decision engine can directly call `get_optimization_context()` and issue FoxESS commands through the same Python process.

## Options Considered

### Option A: Stay with Node.js API + Python pipeline (ADR-005 status quo)

**Pros:** TypeScript type-sharing with React/React Native frontends.
**Cons:** Two runtimes. Duplicated analytics queries. Custom API clients for FoxESS/Amber. Ongoing maintenance burden of thin wrappers around APIs that already have official Python SDKs.

### Option B: Python/FastAPI for entire backend (selected)

**Pros:** Single language for backend + pipeline. Official SDKs for all three external APIs. FastAPI provides async HTTP, WebSocket support, automatic OpenAPI spec generation, and Pydantic models for request/response validation. No query duplication -- API routes call the same analytics functions as the pipeline.
**Cons:** Loses TypeScript type-sharing between backend and frontend. Frontend must maintain its own TypeScript types (mitigated by FastAPI's auto-generated OpenAPI spec, which can be used to generate TypeScript types via `openapi-typescript`).

### Option C: Django

**Pros:** Batteries-included framework.
**Cons:** Heavier than needed for a single-user API. ORM adds unnecessary abstraction over direct SQLite queries. Async support is less mature than FastAPI.

## Decision

**Option B: Python/FastAPI for the entire backend.**

### Stack

| Component | Technology |
|-----------|-----------|
| Web framework | FastAPI |
| ASGI server | Uvicorn |
| WebSocket | FastAPI WebSocket (built-in) |
| Validation | Pydantic v2 models |
| Database | SQLite via `aiosqlite` (async) or `sqlite3` (sync for pipeline) |
| FoxESS integration | `foxesscloud` PyPI package |
| Amber integration | `amberelectric` PyPI package |
| Solar forecast | Open-Meteo via `httpx` |
| Scheduling | APScheduler (in-process) or systemd timers |
| Testing | pytest + httpx (async test client) |
| Dependency management | Poetry (pyproject.toml + poetry.lock) |

### Project structure

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
    config.py             # Settings (Pydantic BaseSettings, env vars)
    models.py             # Shared domain types
    logging.py            # Structured logging setup

data/
  migrations/             # SQL migration files (existing)
  battery_brain.db        # SQLite database (created at runtime)

pyproject.toml            # Poetry project config + dependencies
poetry.lock               # Locked dependency versions
```

### Type sharing strategy

With the backend now in Python, the `@battery-brain/shared` TypeScript package concept changes:

- **Backend**: Pydantic models are the source of truth for API shapes. FastAPI auto-generates an OpenAPI 3.1 spec at `/openapi.json`.
- **Frontend (web + mobile)**: Use `openapi-typescript` to generate TypeScript types from the OpenAPI spec. This replaces the hand-maintained shared types package.
- **Workflow**: Backend changes Pydantic models -> CI regenerates TypeScript types -> Frontend imports generated types.

This is actually more robust than hand-maintained shared types -- the OpenAPI spec is always in sync with the running code.

## Consequences

**What becomes easier:**
- Single Python runtime for backend + pipeline + decision engine
- Official SDKs for FoxESS and Amber -- no custom API clients to maintain
- Analytics queries shared directly between pipeline and API (no duplication)
- FastAPI generates OpenAPI spec automatically -- frontend types derived from it
- Pydantic validation catches malformed requests at the boundary
- Decision engine can directly call pipeline analytics and FoxESS SDK in-process

**What becomes harder:**
- Frontend developers must run type generation from OpenAPI spec (minor tooling setup)
- Python async patterns differ from Node.js -- team must be comfortable with asyncio
- No compile-time type checking like TypeScript (mitigated by Pydantic, mypy, and pytest)
- WebSocket implementation in FastAPI is slightly less ergonomic than Socket.IO (but sufficient)
