# ADR-005: Polyglot Split -- Python Data Pipeline + Node.js API Server

## Status

Superseded by [ADR-006](ADR-006-python-fastapi-backend.md) -- the polyglot split is no longer needed because the entire backend is now Python. The data access boundary table below remains useful as a reference for which modules own which tables.

## Context

ADR-001 specified a single Node.js/TypeScript monolith for the entire backend. During implementation, the data pipeline (API collectors, Bronze/Silver/Gold aggregation) was built in Python. This creates a two-language stack that needs a deliberate architectural decision rather than accidental drift.

The pipeline and API server have fundamentally different runtime characteristics:
- **Pipeline**: Batch/periodic process. Polls external APIs on cron schedules, writes to SQLite, then sleeps. CPU-bound during aggregation. No long-lived connections.
- **API server**: Long-running server. Serves REST and WebSocket requests, reads from SQLite. I/O-bound. Needs fast startup and low latency.

## Options Considered

### Option A: Accept the polyglot split (selected)

Python pipeline runs as a separate process. Node.js API server reads from the same SQLite database. The database file is the integration boundary.

**Pros:** Each process uses the language best suited to its task. Python is strong for data processing and has mature libraries for the external APIs (requests, pandas). Node.js/TypeScript is strong for async HTTP/WebSocket serving and shares types with the React/React Native frontends. Clean process boundary -- no coupling beyond the database schema.
**Cons:** Two runtimes to install and manage. Analytics query functions need to exist in both languages (Python for pipeline diagnostics, TypeScript for the API layer). Must coordinate schema migrations across both codebases.

### Option B: Rewrite pipeline in TypeScript

Port the Python pipeline code to TypeScript to maintain the single-language monolith.

**Pros:** Single language, shared types, one runtime.
**Cons:** Discards working, tested code. TypeScript's data processing ecosystem is less mature. The pipeline and API server are still logically separate concerns that would benefit from process isolation.

### Option C: Switch everything to Python (FastAPI)

Move the API server to Python as well.

**Pros:** Single language.
**Cons:** Loses TypeScript type-sharing with React/React Native frontends. FastAPI is capable but the frontend team would need to manually sync API types. Discards the architectural investment in the Node.js API layer.

## Decision

**Option A: Accept the polyglot split.**

### Boundary contract

The integration boundary is the SQLite database schema. Both processes must agree on:

1. **Table schemas** -- defined in `data/migrations/` SQL files (single source of truth)
2. **Sign conventions** -- `pv_power_w` positive=generating, `bat_power_w` positive=charging/negative=discharging, `grid_power_w` positive=importing/negative=exporting
3. **Time format** -- UTC ISO8601 strings throughout
4. **Data layer access rules**:
   - Python pipeline: writes to Bronze and Silver, reads/writes Gold, writes `pipeline_runs` and `optimization_decisions`
   - Node.js API: reads Silver and Gold, reads/writes `system_config`, reads `optimization_decisions`
   - Neither process modifies the other's write tables

### Deployment model

```
[systemd / cron]
  |
  +-- battery-brain-pipeline  (Python)
  |     Runs on schedule: collectors every 60s/300s/3600s, aggregation every 5min
  |     Writes: Bronze, Silver, Gold layers, optimization_decisions, pipeline_runs
  |     Reads: system_config (re-reads each cycle for latest user settings)
  |
  +-- battery-brain-api       (Node.js)
        Long-running server on port 3000
        Reads: Silver, Gold layers, optimization_decisions, pipeline_runs
        Writes: system_config (user preference changes via dashboard)
        Serves: REST + WebSocket to web dashboard and mobile app
```

### Data access boundary (confirmed)

| Table group | Python writes | Node.js writes | Python reads | Node.js reads |
|---|---|---|---|---|
| Bronze | yes | never | rarely (debug) | never |
| Silver | yes | never | yes (aggregation) | never |
| Gold | yes | never | no | yes (API) |
| `optimization_decisions` | yes | never | yes | yes |
| `system_config` | never | yes | yes | yes |
| `pipeline_runs` | yes | never | no | yes (health) |

Notes:
- `system_config` is written by the Node.js API (user changes settings) and read by both processes. The Python pipeline re-reads config each cycle rather than caching at startup, so changes made via the dashboard take effect on the next pipeline cycle. Safe under WAL with no coordination needed.
- `optimization_decisions` is written exclusively by the Python pipeline (which runs the decision engine). The Node.js API reads it to expose the decision log and current action rationale to the dashboard.
- The Node.js API never reads Bronze or Silver directly -- it reads only from the pre-computed Gold layer and operational tables.

### Query layer duplication

The `analytics.py` query functions (Python) will be mirrored by a TypeScript query module for the API server. The SQL is identical -- only the host language wrapper differs. The data engineer will produce the TypeScript query spec; the backend architect implements it using `better-sqlite3`.

## Consequences

**What becomes easier:**
- Each process can be deployed, restarted, and monitored independently
- Pipeline failures don't crash the API server (and vice versa)
- SQLite WAL mode handles concurrent reads (API) during writes (pipeline) cleanly
- Python's data libraries (requests, etc.) simplify external API integration
- Node.js/TypeScript shares types with frontend codebases

**What becomes harder:**
- Two runtimes in the deployment environment (Python 3.11+, Node.js 20+)
- Schema changes must be coordinated -- migration SQL is the single source of truth
- Analytics queries exist in two languages (mitigated: the SQL is the same, wrappers are thin)
- Developers need familiarity with both languages (acceptable for a small team/solo project)
