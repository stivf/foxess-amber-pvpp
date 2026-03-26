# ADR-003: Shared Backend for Web and Mobile

## Status

Accepted

## Context

Battery Brain has two client interfaces: a web dashboard (Next.js) and a mobile app (React Native). We need to decide whether these share a backend or have separate BFFs (Backend-for-Frontend).

Key considerations:
- Both clients display the same data: battery state, pricing, schedule, savings
- Both clients need the same real-time updates (WebSocket)
- The mobile app has additional needs: push notifications for price spikes and battery events
- This is a personal tool with a single user -- there is no need for client-specific rate limiting or auth flows

## Options Considered

### Option A: Single shared backend (selected)

One API serves both web and mobile. Both clients consume the same REST and WebSocket endpoints.

**Pros:** No code duplication. Single source of truth for business logic. Simpler deployment. One set of API tests. Mobile and web always see consistent data.
**Cons:** API design must satisfy both clients, which could lead to over-fetching for mobile or under-fetching for web. Push notification logic lives in the backend even though it only serves mobile.

### Option B: Separate BFFs

A web-specific BFF and a mobile-specific BFF, both calling shared core services.

**Pros:** Each BFF can tailor responses to its client's needs. Clean separation of push notification logic.
**Cons:** Two APIs to maintain, test, and deploy. Doubles the surface area. Overkill for a single-user system. The data overlap between clients is ~95%, making separate BFFs mostly redundant.

## Decision

**Option A: Single shared backend.**

Design accommodations:
- REST endpoints return full resource representations (not client-specific views). Clients select what they need.
- WebSocket sends the same event stream to all connected clients.
- Push notifications are handled by a dedicated sub-module within the API layer. It uses Firebase Cloud Messaging (FCM) for both iOS and Android. The mobile app registers its device token via a REST endpoint.
- **Type sharing**: The backend defines all API shapes as Pydantic v2 models. FastAPI auto-generates an OpenAPI 3.1 spec, from which TypeScript types are derived using `openapi-typescript`. Both the web app and mobile app import from the generated types. (Updated per ADR-006 -- replaces the original `@battery-brain/shared` TypeScript package approach.)

## Consequences

**What becomes easier:**
- One API to build, test, and maintain
- Consistent behavior across web and mobile
- Shared TypeScript types eliminate client/server drift
- Single deployment pipeline

**What becomes harder:**
- Must be careful not to add mobile-specific or web-specific logic to the core API (push notifications are the exception, handled via a dedicated module)
- If clients diverge significantly in the future, a BFF might become necessary (unlikely for this use case)
