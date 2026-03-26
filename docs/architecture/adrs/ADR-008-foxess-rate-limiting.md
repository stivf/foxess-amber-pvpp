# ADR-008: FoxESS API Rate Limit Strategy

## Status

Accepted

## Context

The FoxESS Cloud API enforces a hard limit of **1,440 API calls per day** (error code 40400 when exceeded). This limit applies to the entire API key, across all endpoints. Once exhausted, no further calls are possible until the counter resets (midnight UTC).

The original architecture specified 60-second telemetry polling, which would consume the entire daily budget on a single endpoint (1,440 calls/day = 1 call/minute). This leaves zero budget for:
- Battery control commands (charge/discharge/hold) -- the system's primary purpose
- Work mode changes
- Any burst polling during price spikes

This is a critical constraint that affects the system's ability to function. Control commands must always succeed -- a system that can read telemetry but cannot issue charge/discharge commands when prices spike is useless.

## Budget Analysis

Daily budget: **1,440 calls**

| Activity | Interval | Calls/day | Notes |
|----------|----------|-----------|-------|
| Telemetry polling (`get_real`) | 3 min | 480 | Primary data source |
| Decision engine control commands | ~15 min | 96 | `set_work_mode`, `set_times` |
| **Subtotal (normal operation)** | | **576** | **40% of budget** |
| **Reserve (commands + burst)** | | **864** | **60% headroom** |

At a 3-minute telemetry interval:
- 480 calls/day for telemetry (33% of budget)
- ~96 calls/day for commands (7% of budget) -- assumes decision engine acts every 15 min
- ~864 calls remaining as buffer (60%) -- available for burst polling during spikes, retries, or additional API calls

At a 5-minute interval, telemetry drops to 288 calls/day (20% of budget), leaving even more headroom.

## Decision

### 1. Increase FoxESS telemetry polling to 3 minutes (default)

Changed from 60 seconds to **180 seconds**. This is the same interval used by Home Assistant's FoxESS integration, which has been battle-tested against the rate limit.

The 3-minute interval is sufficient for:
- Dashboard battery SoC display (SoC changes slowly -- ~1% per minute at max charge rate)
- Decision engine inputs (decisions run every 15 minutes)
- Historical telemetry charts (30-minute Gold aggregations smooth over any gaps)

The interval is configurable via `system_config.poll_interval_sec` (minimum: 120, default: 180).

### 2. Daily API call budget tracker

A budget tracker module counts all FoxESS API calls and enforces soft/hard limits:

```python
class FoxESSBudget:
    DAILY_LIMIT = 1440
    COMMAND_RESERVE = 200       # Always keep 200 calls reserved for commands
    WARNING_THRESHOLD = 0.80    # Alert user at 80% usage
    CRITICAL_THRESHOLD = 0.95   # Throttle telemetry at 95% usage

    def can_poll(self) -> bool:
        """Returns True if telemetry polling is allowed (budget - reserve > used)."""
        return self.used_today < (self.DAILY_LIMIT - self.COMMAND_RESERVE)

    def can_command(self) -> bool:
        """Returns True if a command call is allowed (always allowed until hard limit)."""
        return self.used_today < self.DAILY_LIMIT

    def record_call(self, call_type: str) -> None:
        """Track an API call. Persisted to SQLite for crash recovery."""
        ...
```

**Priority tiers:**
1. **Commands (highest)**: Charge, discharge, hold, work mode changes. Always allowed until hard limit. These are the system's reason for existing.
2. **Telemetry (normal)**: Polling `get_real`. Allowed until budget minus command reserve is exhausted.
3. **Burst polling (lowest)**: Faster polling during price spikes. Only allowed if budget is >50% remaining.

### 3. Adaptive polling during price events

During a price spike, the system may temporarily increase polling frequency to get more accurate SoC readings for discharge decisions:

- **Normal**: Poll every 3 minutes (480 calls/day)
- **Price spike active**: Poll every 90 seconds (costs ~2x during spike window, typically 30-60 min)
- **Budget warning (>80%)**: Reduce to every 5 minutes
- **Budget critical (>95%)**: Suspend telemetry polling entirely, use last known state

The burst cost for a 1-hour spike at 90-second intervals: 40 extra calls. Affordable with 60% budget headroom.

### 4. Aggressive caching

The latest telemetry response is cached in memory with a timestamp. Before making an API call:
- If cached data is younger than the poll interval, skip the API call
- The WebSocket pushes cached data to clients regardless of whether a new API call was made
- The decision engine reads from the Silver database layer, not from live API calls

### 5. Command budget reservation

The budget tracker always reserves 200 calls for commands. This guarantees:
- At least 50 decision engine cycles can issue commands (at 4 calls per cycle)
- Manual overrides from the dashboard always work
- Emergency actions (e.g., hold during extreme spike) are never blocked by telemetry polling

If telemetry has consumed the non-reserved budget, telemetry polling stops but commands continue to work.

### 6. Graceful degradation

When the API budget is exhausted or the FoxESS API is unreachable:

| Budget state | Telemetry | Commands | Dashboard | User notification |
|---|---|---|---|---|
| Normal (<80%) | Every 3 min | Always | Live data | None |
| Warning (80-95%) | Every 5 min | Always | Live data | "API budget warning" |
| Critical (>95%) | Suspended | Available | Last known state | "API budget critical" |
| Exhausted (100%) | Suspended | Suspended | Last known state, stale indicator | "FoxESS API limit reached, resets at midnight UTC" |

### 7. Budget tracking persistence

API call counts are persisted to SQLite (new table `foxess_api_budget`) so the count survives process restarts:

```sql
CREATE TABLE IF NOT EXISTS foxess_api_budget (
    date        TEXT NOT NULL PRIMARY KEY,  -- YYYY-MM-DD (UTC)
    calls_used  INTEGER NOT NULL DEFAULT 0,
    calls_poll  INTEGER NOT NULL DEFAULT 0,
    calls_cmd   INTEGER NOT NULL DEFAULT 0,
    last_call   TEXT                        -- ISO8601 timestamp of last call
);
```

## Consequences

**What becomes easier:**
- The system can run reliably 24/7 without hitting the API limit
- Commands are always available when the decision engine needs them
- Users get clear feedback on budget state via dashboard alerts
- The budget tracker provides observability into API usage patterns

**What becomes harder:**
- Dashboard telemetry is less granular (3-min vs 1-min updates). Acceptable -- battery state changes slowly.
- Adaptive polling adds complexity to the scheduler logic
- Must track call counts across process restarts (mitigated by SQLite persistence)
- The budget tracker is an additional module to test and maintain
