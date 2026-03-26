# PRD: Battery Brain

**Status**: Draft
**Author**: Alex (Product Manager)
**Last Updated**: 2026-03-26
**Version**: 1.0
**Stakeholders**: Owner/Developer

---

## 1. Problem Statement

Home battery systems connected to the Australian electricity grid face highly volatile spot pricing through retailers like Amber Electric. Prices can swing from negative (you get paid to consume) to extreme spikes above $1/kWh within the same day. Default inverter behavior -- simple time-of-use charging or "set and forget" -- leaves significant savings on the table because it cannot react to real-time price signals, solar generation forecasts, or household consumption patterns.

The owner of a FoxESS inverter with battery storage on the Amber Electric plan needs an automated system that makes optimal charge/discharge decisions based on real-time pricing, solar forecasts, and consumption history -- maximizing financial savings without manual intervention.

**Evidence:**
- Amber Electric publishes 30-minute interval pricing with frequent intra-day volatility, creating optimization opportunities that static schedules cannot capture.
- FoxESS inverters support remote charge/discharge control via API, but have no built-in price-aware optimization.
- The Australian NEM (National Electricity Market) regularly produces negative pricing events and afternoon/evening spikes, creating arbitrage windows that a reactive system can exploit.
- No existing open-source tool integrates FoxESS control with Amber Electric pricing in a purpose-built optimization engine.

---

## 2. Product Vision

Battery Brain is a personal home battery management system that watches electricity prices, solar forecasts, and household consumption in real time, then automatically tells the battery when to charge, hold, or discharge to maximize savings.

The user should be able to glance at a dashboard, see that the system is saving them money, and trust it to make good decisions autonomously. When they want control, they get intuitive tools -- aggressiveness profiles, calendar-based scheduling, and manual overrides -- without needing to understand the underlying optimization math.

**One-liner**: Battery Brain saves you money by automatically buying electricity when it is cheap, storing solar energy, and selling when prices spike.

---

## 3. Goals and Success Metrics

| Goal | Metric | Baseline | Target | Measurement Window |
|------|--------|----------|--------|--------------------|
| Reduce electricity costs | Monthly electricity savings vs. no-battery baseline | $0 (no optimization) | $60-120/month (seasonal) | Rolling monthly |
| Maximize solar self-consumption | Self-consumption rate | ~50% (no battery mgmt) | >70% | Rolling 30 days |
| Hands-off operation | Manual overrides per week | N/A | <2 (system handles it) | Rolling weekly |
| System reliability | Uptime (decision engine running) | N/A | >99% | Rolling 30 days |
| User awareness | Time to answer "Am I saving money?" | N/A | <2 seconds (glance) | Qualitative |
| Respect API limits | FoxESS API budget utilization | N/A | <80% daily average | Rolling daily |

---

## 4. Non-Goals

These are explicitly out of scope for the MVP and foreseeable iterations:

- **Multi-user / multi-site support.** This is a single-home, single-user tool. No auth system, no user management, no multi-tenancy.
- **Support for inverters other than FoxESS.** The system uses the `foxesscloud` SDK. Abstracting to multiple inverter brands adds complexity with no immediate value.
- **Support for retailers other than Amber Electric.** Amber's real-time pricing API is the data source. Flat-rate or time-of-use retailers do not benefit from this optimization.
- **Machine learning or advanced forecasting.** The MVP uses percentile-based thresholds and linear solar yield estimates. ML-based consumption prediction and multi-day lookahead are future enhancements.
- **Grid island / backup power management.** The system optimizes for financial savings, not blackout resilience (though the preservation aggressiveness slider provides indirect control over reserve levels).
- **iOS/Android app store distribution.** Mobile app will be distributed via TestFlight or side-loading. No app store review process.

---

## 5. User Persona

**Primary Persona: The Owner**

A technically capable homeowner in Australia with a FoxESS inverter, battery storage (e.g., 10.4 kWh), and rooftop solar on an Amber Electric wholesale pricing plan. They are comfortable with Docker, environment variables, and self-hosting. They want to maximize the financial return on their battery investment without babysitting the system daily.

**Key behaviors:**
- Checks the dashboard 1-3 times per day (morning, afternoon peak, evening review)
- Wants to understand what the system is doing and why (transparency builds trust)
- Occasionally wants manual control for specific situations (guests coming, going on holiday)
- Reviews weekly/monthly savings to validate the system is working
- Adjusts strategy seasonally (more aggressive export in summer, more preservation in winter)

---

## 6. User Stories

### Core Automation

**Story 1**: As the owner, I want the system to automatically charge my battery when electricity prices are cheap so that I have stored energy to use during expensive periods.
- **Acceptance Criteria**:
  - [ ] Given the current Amber price is below the charge threshold for the active profile, the system sends a CHARGE command to FoxESS
  - [ ] Given the battery is already full (SoC >= 95%), no charge command is sent regardless of price
  - [ ] The charge threshold is derived from the active aggressiveness profile's `import_aggressiveness` parameter and the price forecast distribution

**Story 2**: As the owner, I want the system to automatically discharge my battery or export to the grid when prices spike so that I maximize revenue from stored energy.
- **Acceptance Criteria**:
  - [ ] Given the current Amber price exceeds the discharge threshold for the active profile, the system sends a DISCHARGE command to FoxESS
  - [ ] Given the battery SoC is at or below the effective minimum SoC (derived from `preservation_aggressiveness`), no discharge command is sent
  - [ ] Given there is excess solar generation during a price spike, the system exports to the grid

**Story 3**: As the owner, I want the system to hold my battery charge during moderate prices so that I do not waste charge cycles on marginal savings.
- **Acceptance Criteria**:
  - [ ] Given the price is between charge and discharge thresholds, the system sets HOLD mode
  - [ ] Solar energy is still used for self-consumption during HOLD periods

### Dashboard and Monitoring

**Story 4**: As the owner, I want to see my current battery state, electricity price, and today's savings at a glance so that I can confirm the system is working without deep investigation.
- **Acceptance Criteria**:
  - [ ] The dashboard loads a single `GET /status` call that returns battery SoC, current price, savings, solar generation, active profile, and current schedule action
  - [ ] Stat pills display battery %, price (color-coded), savings, and solar generation
  - [ ] Status header shows a plain English description of current system behavior (e.g., "Storing solar energy")
  - [ ] All Level 1 information is visible within 2 seconds of page load

**Story 5**: As the owner, I want to see a forecast chart showing expected prices, solar generation, and planned battery actions so that I can anticipate what the system will do.
- **Acceptance Criteria**:
  - [ ] Dual-axis chart shows price bars (right axis, c/kWh) and solar/consumption (left axis, kW)
  - [ ] A NOW marker indicates the current time
  - [ ] The schedule timeline below the chart shows planned CHARGE/HOLD/DISCHARGE blocks with profile assignments

**Story 6**: As the owner, I want to understand why the system is making its current decision so that I trust its judgment.
- **Acceptance Criteria**:
  - [ ] A decision explanation component displays 2-3 sentences in plain English (e.g., "Grid price dropped to 8c/kWh -- below your 20c import threshold. Charging from grid at 3.0 kW.")
  - [ ] The explanation references the active profile and relevant thresholds

### Manual Override

**Story 7**: As the owner, I want to manually force charge, discharge, or hold my battery for a specified duration so that I can override the system when I know something it does not.
- **Acceptance Criteria**:
  - [ ] A mode control (segmented control on web, FAB + bottom sheet on mobile) allows selecting Auto / Force Charge / Force Discharge
  - [ ] Duration picker offers 30 min, 1 hour, 2 hours, or "until next schedule"
  - [ ] The override is applied immediately via `POST /schedule/override`
  - [ ] The override can be cancelled, returning to the computed schedule via `DELETE /schedule/override`

### Aggressiveness Profiles

**Story 8**: As the owner, I want to configure how aggressively the system buys, sells, and preserves battery charge so that I can tune the system's behavior to match my priorities.
- **Acceptance Criteria**:
  - [ ] Three independent sliders control export, preservation, and import aggressiveness (0.0-1.0)
  - [ ] Named presets (Conservative, Balanced, Aggressive) set all three sliders to predefined positions
  - [ ] A real-time impact summary shows the practical effect of current settings (reserve level, price thresholds, estimated daily savings range)
  - [ ] Changes take effect on the next decision engine cycle (within 15 minutes)

**Story 9**: As the owner, I want to schedule different aggressiveness profiles for different times of day and days of week so that the system behaves differently during peak hours vs. overnight.
- **Acceptance Criteria**:
  - [ ] A weekly calendar view shows profile assignments by time block
  - [ ] Recurring rules can be created for specific days and time ranges (e.g., Weekdays 4-8 PM = Aggressive)
  - [ ] One-off overrides can be set for specific dates and time ranges (e.g., next Tuesday = Conservative)
  - [ ] Resolution priority: one-off override > recurring rule > default profile
  - [ ] The active profile is visible in the dashboard nav bar with "until [time]" indicator

### Analytics

**Story 10**: As the owner, I want to review my savings over time (daily, weekly, monthly) so that I can validate the system is delivering financial value.
- **Acceptance Criteria**:
  - [ ] Savings analytics available via `GET /analytics/savings` with period and date range filters
  - [ ] History page shows cumulative savings chart, energy flow summary (solar generated, grid import/export), self-consumption rate, and battery cycle count
  - [ ] Daily breakdown table with CSV export option

### Notifications

**Story 11**: As the owner, I want to receive push notifications for price spikes, battery events, and daily savings summaries so that I stay informed without actively checking the app.
- **Acceptance Criteria**:
  - [ ] Push notifications for: price spike (high priority), price drop (medium), battery full (low), battery low (high), mode change (low), daily summary (low)
  - [ ] Notification preferences configurable via `PATCH /preferences` (each type can be toggled on/off)
  - [ ] Quiet hours setting suppresses non-critical notifications

---

## 7. Solution Overview

Battery Brain is a self-hosted Python/FastAPI backend that polls external APIs (Amber Electric, FoxESS, Open-Meteo), runs a decision engine every 15 minutes, and sends charge/discharge commands to the inverter. Web and mobile clients connect via REST API and WebSocket for real-time updates.

### Core Architecture

- **Backend**: Python 3.12+ / FastAPI modular monolith, single process with APScheduler for periodic tasks
- **Database**: SQLite (WAL mode) with a Medallion architecture (Bronze/Silver/Gold layers)
- **External Integrations**: Amber Electric SDK (`amberelectric`), FoxESS SDK (`foxesscloud`), Open-Meteo via `httpx`
- **Web Dashboard**: Next.js with TypeScript types auto-generated from the OpenAPI spec
- **Mobile App**: React Native with the same generated types
- **Deployment**: Docker + Docker Compose on a single machine (Raspberry Pi, home server, or small VM)
- **Dependency Management**: Poetry (`pyproject.toml` + `poetry.lock`)

### Decision Engine

The engine runs every 15 minutes and produces a 24-hour schedule of CHARGE/HOLD/DISCHARGE/AUTO actions across 30-minute slots. For each slot, it:

1. Resolves the active aggressiveness profile from the calendar (override > recurring rule > default)
2. Computes effective thresholds from the profile's three aggressiveness parameters
3. Estimates net load (consumption forecast - solar forecast)
4. Assigns the optimal action based on price vs. thresholds and battery state

Base thresholds are derived from the price forecast distribution (percentiles), so the system adapts to daily price patterns rather than using fixed price points.

### FoxESS API Rate Limit Constraint

FoxESS enforces a hard limit of **1,440 API calls/day**. This is the single most important technical constraint and shapes the entire polling and command strategy:

- **Budget tracker** persisted to SQLite, survives restarts
- **200 calls reserved** for charge/discharge commands (never starved by telemetry)
- **Adaptive polling**: 3 min normal, 90 sec during price spikes, 5 min when budget > 80%, suspended at > 95%
- **Graceful degradation**: dashboard shows stale data with indicator when budget is exhausted; commands suspended only at hard limit

At default 3-minute polling, telemetry consumes ~480 calls/day (33% of budget), leaving 60% headroom.

### Key Design Decisions

- **Profiles over raw thresholds**: Users configure three intuitive aggressiveness sliders instead of setting raw price thresholds. The engine translates aggressiveness to thresholds using the price forecast distribution. This is easier to understand and adapts to changing market conditions.
- **Calendar scheduling**: Different times of day have different optimal strategies (e.g., aggressive export during peak pricing windows). Calendar rules automate this without requiring daily manual intervention.
- **Savings-first framing**: The UI leads with "You saved $X" rather than "You spent $Y". Positive framing reinforces the value of the system and builds engagement.
- **Pydantic as contract source of truth**: API types are defined once in Python, auto-generated as TypeScript for frontends. No manual type synchronization.

---

## 8. MVP Scope

### MVP (v1.0) -- Build This First

| Feature | Description |
|---------|-------------|
| Decision engine | Percentile-based threshold optimization with 15-minute cycle, 24-hour lookahead |
| Aggressiveness profiles | CRUD for profiles with three axes (export, preservation, import) |
| Calendar scheduling | Recurring rules + one-off overrides with resolution priority |
| Data pipeline | Amber price polling (5 min), FoxESS telemetry (3 min adaptive), Open-Meteo solar forecast (60 min) |
| FoxESS rate limiting | Budget tracker, command reservation, adaptive polling, graceful degradation |
| REST API | Full API contract as documented (status, battery, pricing, schedule, profiles, calendar, analytics, preferences) |
| WebSocket | Real-time updates for battery state, price, schedule, profile changes, alerts |
| Web dashboard | Next.js dashboard with all Level 1 and Level 2 components (stat pills, battery gauge, price display, power flow, forecast chart, schedule timeline, energy cards, savings card, mode control, decision explanation) |
| History page | Savings chart, energy summary, daily breakdown with CSV export |
| Strategy page | Aggressiveness sliders with presets, weekly calendar view, one-off overrides |
| Settings page | Notification toggles, API connection status, theme selector |
| Docker deployment | docker-compose for dev (hot reload) and production |
| SQLite storage | Medallion architecture with retention policies |
| Health check | `GET /health` with external API connection status |

### v1.1 -- Fast Follow

| Feature | Description |
|---------|-------------|
| Mobile app (React Native) | Dashboard, strategy, history, settings with bottom tab navigation |
| Push notifications | FCM-based notifications for price spikes, battery events, daily summary |
| Mobile FAB | Floating action button for quick manual override from any screen |
| Home screen widget | Compact battery/price/savings widget (iOS + Android) |

### v2.0 -- Future

| Feature | Description |
|---------|-------------|
| ML consumption prediction | Train on historical household consumption patterns for better forecasting |
| Multi-day weather lookahead | Use 3-5 day weather forecasts to anticipate low-solar periods |
| Linear programming optimizer | Replace percentile heuristic with LP solver for globally optimal scheduling |
| Tariff comparison | Show estimated costs on flat-rate vs. Amber to validate plan choice |
| Battery health tracking | Monitor cycle count and capacity degradation over time |

---

## 9. Technical Considerations

### Dependencies

| Dependency | Purpose | Risk |
|------------|---------|------|
| `foxesscloud` SDK (PyPI) | FoxESS inverter control + telemetry | Medium -- third-party SDK, must track version changes |
| `amberelectric` SDK (PyPI) | Amber Electric pricing data | Low -- official SDK, well-maintained |
| Open-Meteo API | Solar irradiance forecast | Low -- free, no API key, no rate limit |
| SQLite | All persistent state | Low -- embedded, no external service |

### Known Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FoxESS API changes or SDK breaks | Medium | High | Pin SDK version, wrap in adapter, integration tests against recorded responses |
| FoxESS rate limit hit during high-activity day | Low | Medium | Budget tracker with adaptive throttling and command reservation |
| Amber API outage | Low | High | Hold current schedule, use last known prices, alert user |
| SQLite corruption on power loss | Low | Medium | WAL mode, host-level backup of single file |
| Decision engine makes a bad call (charges during spike) | Low | Medium | All decisions logged to `optimization_decisions` table for audit; manual override always available |

### Open Questions

None -- architecture, API contract, and design are complete. Implementation can begin.

---

## 10. Launch Plan

This is a personal/internal tool. "Launch" means the system is running reliably on the owner's infrastructure and making correct decisions.

| Phase | Target | Success Gate |
|-------|--------|-------------|
| Alpha | Backend + decision engine running in Docker, making real decisions against live APIs | Correct charge/discharge commands observed over 48 hours; no FoxESS rate limit violations |
| Beta | Web dashboard connected, all dashboard components rendering with live data | Owner can monitor system behavior via dashboard; savings tracking matches manual calculation |
| v1.0 | Full web app (dashboard, history, strategy, settings) with calendar scheduling and profiles | System runs autonomously for 7+ days with measurable savings; all user stories pass acceptance criteria |
| v1.1 | Mobile app with push notifications | Notifications delivered for price spikes; mobile dashboard matches web data |

### Rollback

If the decision engine behaves incorrectly:
1. Set battery to AUTO mode via manual override (one API call)
2. Stop the Docker container
3. The FoxESS inverter reverts to its default behavior
4. Review `optimization_decisions` table to diagnose the issue

There is no risk of permanent damage -- the inverter's built-in safety limits (min SoC, charge/discharge rate caps) are always enforced by the hardware regardless of what commands the software sends.

---

## 11. Appendix

### Reference Documents

- [Architecture](architecture/ARCHITECTURE.md) -- System design, module decomposition, data flow
- [API Contract](architecture/API_CONTRACT.md) -- Full REST and WebSocket specification
- [Design System](design/DESIGN_SYSTEM.md) -- Color tokens, typography, component specifications
- [Information Architecture](design/IA.md) -- Page structure, navigation, user flows
- [Wireframes](design/WIREFRAMES.md) -- Text-based wireframes for web and mobile

### Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Modular Monolith Architecture | Superseded by ADR-006 |
| ADR-002 | Polling for Price Data | Accepted |
| ADR-003 | Shared Backend for Web and Mobile | Accepted |
| ADR-004 | Data Storage Strategy | Accepted (revised) |
| ADR-005 | Polyglot Split | Superseded by ADR-006 |
| ADR-006 | Python/FastAPI Backend | Accepted |
| ADR-007 | Docker-Based Deployment | Accepted |
| ADR-008 | FoxESS API Rate Limit Strategy | Accepted |
