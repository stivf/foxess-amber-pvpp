I want an agent team called "battery-brain".

The project is a home battery management system that integrates with the FoxESS inverter API
and Amber Electric's real-time pricing API. It should optimize battery charge/discharge
decisions based on: electricity spot price, solar forecast, household consumption patterns,
grid feed-in tariffs, and time-of-use signals.

The team should consist of:

1. **Product Manager** (model: opus) — Define the product requirements, user stories, and success metrics.
   Identify the core decision-making logic (when to charge, hold, or discharge the battery)
   and prioritize features for an MVP vs future iterations. Produce a PRD covering the
   control algorithm, data inputs, user-facing controls, and alert/notification strategy.

2. **Software Architect** (model: opus) — Design the overall system architecture: API integrations
   (FoxESS, Amber Electric, weather/solar forecast), the decision engine, data storage,
   and the web/mobile app structure. Produce architecture decision records for key choices
   (e.g., monolith vs services, push vs poll for price data, shared backend for web+mobile).
   Define the API contract between frontend and backend.

3. **Backend Architect** (model: sonnet) — Implement the backend: REST/WebSocket API, integration with
   FoxESS battery control API and Amber Electric pricing API, the battery optimization
   engine (scheduling charge/discharge based on price forecasts and solar generation),
   persistent storage for historical data and user preferences, and a job scheduler for
   periodic decision cycles.

4. **Data Engineer** (model: sonnet) — Design the data pipeline for ingesting real-time price signals,
   solar irradiance forecasts, and battery telemetry from FoxESS. Build the time-series
   storage and aggregation layer that feeds the optimization engine and the dashboard
   analytics (cost savings, self-consumption rate, grid export revenue).

5. **Frontend Developer** (model: sonnet) — Build the web dashboard using React/Next.js: real-time battery
   state of charge, current electricity price, today's price forecast chart,
   charge/discharge schedule visualization, historical savings reports, and manual override
   controls. Ensure responsive design that works well on desktop and tablet.

6. **Mobile App Builder** (model: sonnet) — Build a companion mobile app (React Native for iOS/Android):
   push notifications for price spikes or battery events, quick-glance widget showing
   current state, manual override controls, and historical savings summary. Share API
   client and core types with the web frontend.

7. **UX Architect** (model: opus) — Design the information architecture and interaction patterns across
   web and mobile. Create the design system (components, color palette for price
   heat-mapping, battery charge visualization). Ensure the dashboard is glanceable — a
   user should understand their battery status and whether they're saving money within
   2 seconds of looking at it.

Coordination rules:
- The Software Architect leads initial architecture decisions; all agents review and flag concerns.
- Backend Architect and Data Engineer collaborate on the data model and API contracts before implementation begins.
- Frontend Developer and Mobile App Builder share a common API client library and design tokens from UX Architect.
- Product Manager validates that each agent's output aligns with the PRD and MVP scope.
- All agents should prefer simplicity — this is a personal/internal tool, not enterprise software.
