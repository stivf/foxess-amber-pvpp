# ADR-002: Polling for Price Data

## Status

Accepted

## Context

Amber Electric provides real-time electricity pricing data that the decision engine needs to optimize charge/discharge schedules. We need to decide how to ingest this data.

Amber's API is a REST API that returns current pricing and a 24-hour forecast with 30-minute intervals. They do not offer a WebSocket or webhook/push mechanism. Price data updates every 5 minutes (the NEM dispatch interval).

Key considerations:
- Price changes are the primary driver for battery decisions
- Stale price data could lead to suboptimal or costly decisions
- Amber has API rate limits that must be respected
- The system should continue operating (in degraded mode) if the API is temporarily unavailable

## Options Considered

### Option A: Polling at fixed interval (selected)

Poll the Amber API every 5 minutes, cache the response, and emit an event if the price has changed materially.

**Pros:** Simple, predictable, respects rate limits, easy to implement retry/backoff. Aligns with NEM's 5-minute dispatch interval -- polling more frequently would not yield new data.
**Cons:** Up to 5 minutes of staleness (acceptable for battery management decisions that operate on 15-30 minute horizons).

### Option B: Aggressive polling (every 30 seconds)

Poll much more frequently to minimize staleness.

**Pros:** Near-real-time data.
**Cons:** Likely exceeds Amber's rate limits. Wastes resources. The NEM only dispatches every 5 minutes, so sub-minute polling returns the same data repeatedly.

### Option C: WebSocket / Server-Sent Events

Maintain a persistent connection for real-time price pushes.

**Pros:** Lowest latency for price updates.
**Cons:** Amber does not offer this. We would need to build a polling-to-push adapter ourselves, which adds complexity without real benefit (since the source data only updates every 5 minutes anyway).

## Decision

**Option A: Poll every 5 minutes.**

Implementation details:
- Use a simple cron job within the scheduler module
- Cache the full price forecast response in memory and persist to database
- Compare new price data against cached data; emit `price.updated` event only on material change
- On API failure: retry with exponential backoff (3 attempts, then skip this cycle)
- If API is unavailable for >15 minutes: alert the user, continue using last known forecast
- Circuit breaker opens after 5 consecutive failures, resets after 5 minutes

## Consequences

**What becomes easier:**
- Implementation is straightforward HTTP polling with caching
- Rate limit compliance is trivial to manage
- Testing is simple -- mock the HTTP response
- The 5-minute interval aligns naturally with NEM dispatch intervals

**What becomes harder:**
- Cannot react to sub-5-minute price movements (not meaningful for battery management)
- If Amber introduces a push mechanism in the future, we would need to refactor (but the adapter pattern makes this manageable)
