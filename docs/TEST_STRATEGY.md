# Battery Brain -- Test Strategy

## 1. Overview

This document defines the testing strategy for the Battery Brain backend. The system integrates FoxESS inverter telemetry, Amber Electric real-time pricing, and a solar forecast pipeline to drive a battery optimization decision engine. Tests must validate correctness of the decision engine, API contract compliance, data pipeline integrity, and resilience of external API integrations.

**Test stack:**
- pytest 8+ with pytest-asyncio for async FastAPI tests
- httpx AsyncClient for REST endpoint integration tests
- pytest-cov for coverage reporting
- In-memory / temporary SQLite databases for all DB-dependent tests
- unittest.mock / pytest-mock for external SDK mocking (no real API calls in tests)

---

## 2. Testing Priorities

### Priority 1 — Decision Engine (Core Business Logic)

The optimizer is the highest-value target. Every threshold calculation, calendar resolution, and scheduling decision must be verifiable in isolation with fixture data.

**What to test:**
- Threshold computation from aggressiveness profile values
- CHARGE / HOLD / DISCHARGE action selection across price/SoC scenarios
- Calendar resolution: one-off override > recurring rule > default profile
- Narrowest-window rule wins on recurring tie-breaks
- Boundary conditions: min SoC, max SoC, zero solar, spike prices
- Effective min SoC scaling from preservation_aggressiveness
- Profile transition correctness on calendar rule boundaries

### Priority 2 — API Endpoints (Contract Compliance)

All REST endpoints defined in `API_CONTRACT.md` must return the documented shapes and HTTP status codes. Tests use an in-memory SQLite database seeded with fixture data.

**What to test:**
- Happy-path GET for every endpoint
- POST / PATCH / DELETE lifecycle for profiles, calendar rules, overrides, preferences, schedule override
- Conflict and 404 error scenarios (delete default profile, delete profile with rules, missing ID)
- Auth rejection (missing / wrong API key)
- WebSocket connection, ping/pong, and event dispatch

### Priority 3 — Data Pipeline

Collectors and aggregators must correctly transform raw API responses into Bronze/Silver/Gold layers.

**What to test:**
- AmberCollector: normalises SDK interval objects, upserts Silver, deduplicates current vs forecast
- FoxESSCollector: normalises device dict, inserts Bronze, upserts Silver, respects budget
- SolarForecastCollector: parses Open-Meteo JSON, computes PV yield estimate, upserts Silver
- Aggregator: 30-min energy integration (trapezoid), daily rollup, cost/savings calculation
- Analytics queries: current state, price feed, solar forecast, savings report, optimisation context
- Migration runner: applies SQL files in order, skips already-applied, idempotent

### Priority 4 — FoxESS Rate Limiter

The budget tracker is safety-critical: exhausting the 1,440-call limit prevents inverter control for the rest of the day.

**What to test:**
- `can_poll()` returns False when calls_used >= daily_limit - command_reserve
- `record_call()` persists counts to DB and survives process restart (read from DB)
- Adaptive polling intervals at normal / warning / critical thresholds
- Collector skips poll and returns `budget_skip` when budget exhausted
- Budget resets to zero at UTC midnight
- Command calls always recorded regardless of polling budget

### Priority 5 — External API Mocking

No test may make a real network call. All external SDK/HTTP calls must be intercepted.

**Mock strategy:**
- `amberelectric` SDK: mock `AmberApi.get_current_price()` and `get_prices()` with fixture objects
- `foxesscloud`: mock `foxesscloud.openapi.get_real()` return dict
- Open-Meteo: intercept `httpx.get()` with `httpx.MockTransport` or `unittest.mock.patch`

---

## 3. Test Organization

```
backend/
  tests/
    conftest.py              # Shared fixtures: test DB, app client, mock SDKs
    unit/
      test_optimizer.py      # Decision engine unit tests (pure logic, no DB)
      test_strategy.py       # Threshold / price distribution calculations
      test_calendar.py       # Calendar resolution algorithm
      test_solar_yield.py    # PV yield estimation formula
      test_aggregator.py     # 30-min and daily aggregation logic
      test_rate_limiter.py   # FoxESS budget tracker
    integration/
      test_api_status.py     # GET /status
      test_api_battery.py    # GET /battery/state, /battery/history
      test_api_pricing.py    # GET /pricing/current, /pricing/history
      test_api_schedule.py   # GET /schedule, POST /override, DELETE /override
      test_api_profiles.py   # Profiles CRUD
      test_api_calendar.py   # Calendar rules + overrides CRUD, GET /active
      test_api_preferences.py # GET /preferences, PATCH /preferences
      test_api_analytics.py  # GET /analytics/savings
      test_api_health.py     # GET /health
      test_websocket.py      # WebSocket events
      test_pipeline_amber.py # AmberCollector with mocked SDK
      test_pipeline_foxess.py # FoxESSCollector with mocked SDK
      test_pipeline_solar.py # SolarForecastCollector with mocked HTTP
      test_pipeline_aggregator.py # Aggregator with seeded DB
      test_pipeline_analytics.py  # Analytics queries with seeded DB
      test_migrations.py     # Migration runner
```

---

## 4. Test Infrastructure

### Test Database

Each test that needs a database gets a fresh temporary SQLite file (via `tmp_path` fixture). Migrations are applied once per test session via the `test_db` fixture in `conftest.py`. Tests that need data use factory helpers to insert rows.

### FastAPI Test Client

`conftest.py` provides an async `AsyncClient` connected to the FastAPI app with:
- `DB_PATH` overridden to the test database
- External SDKs (amberelectric, foxesscloud, httpx) patched at the module level
- API key auth header pre-applied

### Coverage Targets

| Module | Target |
|--------|--------|
| `src/engine/` | 95% |
| `src/pipeline/` | 90% |
| `src/api/routes/` | 85% |
| Overall | 85% |

Run coverage: `pytest --cov=src --cov-report=term-missing`

---

## 5. CI Integration

Tests run on every push and PR. The test command is:

```bash
pytest backend/tests/ -v --cov=src --cov-report=term-missing --cov-fail-under=85
```

External API calls are always mocked — no API keys required in CI.

---

## 6. Out of Scope

- Frontend (Next.js) and mobile (React Native) testing: handled by respective teams
- End-to-end testing against live FoxESS/Amber APIs: manual, in development environment only
- Load/performance testing: not required at MVP scale (single-user, home system)
