# ADR-001: Modular Monolith Architecture

## Status

Superseded by [ADR-006](ADR-006-python-fastapi-backend.md) -- backend language changed from Node.js/TypeScript to Python/FastAPI. The modular monolith principle still applies; only the language and framework changed.

## Context

We need to decide the overall architectural style for Battery Brain. The system has several logical components (pricing integration, solar forecasting, battery control, decision engine, API layer, data pipeline) that could be deployed as separate services or as a single application.

Key constraints:
- This is a personal/internal tool maintained by a small team (or solo developer)
- The system runs on a single machine (home server, Raspberry Pi, or small VM)
- All components need access to shared state (battery SoC, price cache, schedule)
- Operational overhead should be minimal -- no Kubernetes, no service mesh
- The system needs to be reliable for home automation (uptime matters, but not at enterprise scale)

## Options Considered

### Option A: Microservices

Each module (pricing, solar, battery, decision engine, API) is a separate deployable service communicating via HTTP or a message broker.

**Pros:** Independent deployment, technology flexibility, clear boundaries.
**Cons:** Massive operational overhead for a personal tool. Need service discovery, inter-service communication, distributed tracing, and deployment orchestration. Latency between services adds complexity to the real-time decision cycle. A single Raspberry Pi would struggle to run 5+ separate processes plus a message broker.

### Option B: Modular Monolith (selected)

A single Node.js application with well-defined internal modules that communicate through typed interfaces. Modules are organized by domain (pricing, battery, solar, decision engine) but share the same process and deployment.

**Pros:** Simple deployment (one process), easy local development, shared memory for low-latency internal communication, can be refactored to services later if needed.
**Cons:** Must maintain module discipline manually (no process boundary enforcement). Risk of modules becoming coupled over time.

### Option C: Serverless Functions

Each integration and the decision engine as separate cloud functions, triggered by schedules or events.

**Pros:** No server management, pay-per-use.
**Cons:** Cold start latency is problematic for real-time battery control. Vendor lock-in. Harder to run locally. Ongoing cloud costs for frequent polling. FoxESS commands need low-latency execution.

## Decision

**Option B: Modular Monolith.**

The system runs as a single Node.js (TypeScript) application. Internal modules have clear interfaces and communicate through in-process function calls and an event emitter (for loose coupling where appropriate, e.g., price spike notifications). The module boundary discipline is enforced through:
- Directory structure (each module has an `index.ts` barrel file that defines its public API)
- ESLint rules prohibiting deep imports across module boundaries
- TypeScript interfaces for inter-module contracts

## Consequences

**What becomes easier:**
- Deployment is trivial: one process, one systemd unit, one Docker container
- Local development needs no infrastructure beyond Node.js and a database
- Debugging is straightforward with a single stack trace
- Shared types and interfaces reduce serialization/deserialization overhead
- The decision engine can synchronously access all data sources in-memory

**What becomes harder:**
- Must actively resist coupling -- without process boundaries, it is easy to take shortcuts
- Cannot scale individual components independently (not needed for single-user system)
- If we ever need multi-tenancy, this would require significant refactoring (not a current requirement)
- Technology choices are constrained to what works well in Node.js (acceptable trade-off)
