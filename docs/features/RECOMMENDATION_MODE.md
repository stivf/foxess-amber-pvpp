# Feature Spec: Recommendation Mode

**Status**: Draft
**Author**: Alex (Product Manager)
**Last Updated**: 2026-03-26
**Version**: 1.0
**Parent PRD**: [Battery Brain PRD](../PRD.md)

---

## 1. Problem Statement

Battery Brain currently operates in a binary model: Auto mode (system controls everything) or Manual Override (user forces a specific action). Some users trust the system's optimization but want to stay in the loop for high-impact decisions -- particularly during price spikes where a single discharge window can be worth $2-5. Others are new to the system and want to build confidence before handing over full control.

There is no middle ground between "do everything for me" and "I'll handle it myself." Recommendation Mode fills this gap by letting the decision engine propose actions that the user explicitly approves before execution.

**Why this matters now:**
- User interviews (n=3 from early alpha testers) surfaced a recurring theme: "I want to see what it would do before it does it."
- The system's decision explanations (Component 10 in the design system) already generate plain English reasoning -- Recommendation Mode puts that reasoning into an actionable workflow instead of a passive display.
- Push notifications (v1.1 roadmap) are a prerequisite. Recommendation Mode is the first feature that makes notifications bidirectional rather than informational.

---

## 2. Feature Overview

Recommendation Mode is a new operating mode alongside Auto and Manual Override. When active:

1. The decision engine computes optimal schedules as usual.
2. Instead of executing commands automatically, it creates a **recommendation** with a plain English explanation, estimated savings, and a time-sensitivity window.
3. The user receives the recommendation via the web dashboard and mobile push notification.
4. The user can **approve** (system executes the command) or **dismiss** (system holds current state).
5. If the user does not respond within the time-sensitivity window, the recommendation expires and the system holds current state.
6. Expired and dismissed recommendations consume zero FoxESS API calls.

---

## 3. User Stories

### Story 1: Receive a discharge recommendation during a price spike

As the owner, I want to receive a recommendation to discharge my battery when prices spike so that I can decide whether to sell energy at the current price.

**Acceptance Criteria:**
- [ ] Given Recommendation Mode is active and the decision engine determines DISCHARGE is optimal, a recommendation is created instead of executing the command
- [ ] The recommendation includes: recommended action, current price, estimated hourly savings, battery SoC, and time-sensitivity window
- [ ] The recommendation appears as a card on the web dashboard within 5 seconds of creation
- [ ] A push notification is sent to registered mobile devices within 10 seconds
- [ ] The push notification is actionable (approve/dismiss buttons on the notification itself)

### Story 2: Approve a recommendation and have it execute

As the owner, I want to approve a recommendation and have the system execute the command immediately so that I do not miss the price window.

**Acceptance Criteria:**
- [ ] Given an active recommendation, tapping "Approve" on the web dashboard or push notification triggers command execution
- [ ] The FoxESS command is sent within 5 seconds of approval
- [ ] The dashboard updates to reflect the new active action (e.g., "Discharging -- you approved this recommendation")
- [ ] The recommendation record is updated with status `approved`, approval timestamp, and execution result
- [ ] Only one FoxESS API call is consumed (for the command itself)

### Story 3: Dismiss or ignore a recommendation

As the owner, I want to dismiss a recommendation or let it expire so that the system holds its current state and does not consume an API call.

**Acceptance Criteria:**
- [ ] Given an active recommendation, tapping "Dismiss" sets status to `dismissed` and holds current battery state
- [ ] Given an active recommendation that is not acted upon within the time-sensitivity window, status is set to `expired`
- [ ] No FoxESS API call is made for dismissed or expired recommendations
- [ ] Dismissed/expired recommendations are logged for analytics (track how often the user agrees/disagrees with the engine)

### Story 4: Switch between Auto and Recommendation modes

As the owner, I want to toggle between Auto mode and Recommendation mode so that I can choose my level of control based on my current situation.

**Acceptance Criteria:**
- [ ] A new mode option "Recommend" is added to the mode control (segmented control becomes: Auto | Recommend | Force Charge | Force Discharge)
- [ ] Switching to Recommend mode takes effect on the next decision engine cycle (within 15 minutes)
- [ ] Switching back to Auto mode cancels any pending recommendations and resumes automatic execution
- [ ] The active mode is persisted across restarts via preferences
- [ ] The mode is visible in the dashboard nav bar and stat pills

### Story 5: Review recommendation history and approval rate

As the owner, I want to see a history of past recommendations and how I responded so that I can assess whether the system's suggestions align with my preferences and decide whether to switch to Auto mode.

**Acceptance Criteria:**
- [ ] A "Recommendations" section on the History page shows recent recommendations with their outcomes
- [ ] Each entry shows: timestamp, recommended action, price at time, estimated savings, user response (approved/dismissed/expired), and actual outcome if approved
- [ ] Summary stats show approval rate, total estimated savings from approved recommendations, and estimated missed savings from dismissed/expired ones
- [ ] Data is available via `GET /analytics/recommendations`

---

## 4. Interaction with Existing Features

### Auto Mode
- Auto and Recommend are mutually exclusive. Selecting one deselects the other.
- Auto mode behavior is unchanged. The decision engine executes commands directly.
- Recommendation Mode uses the exact same decision engine logic -- it only changes the execution path (propose vs. execute).

### Manual Override
- Manual Override (Force Charge / Force Discharge) takes priority over Recommendation Mode.
- If a manual override is active, no recommendations are generated for the override duration.
- When the override expires, recommendations resume if Recommendation Mode is still active.

### Aggressiveness Profiles
- Recommendations are computed using the active aggressiveness profile, exactly as in Auto mode.
- The recommendation explanation references which profile is active and how its thresholds influenced the suggestion.
- Calendar-based profile changes still occur automatically -- profile scheduling is not subject to user approval.

### Calendar Scheduling
- Calendar rules and one-off overrides continue to control which profile is active.
- Recommendations respect the active profile for each time slot.
- If a calendar rule changes the profile while a recommendation is pending, the recommendation is invalidated (status set to `superseded`) and a new recommendation may be generated on the next cycle.

### Notifications
- Recommendation Mode extends the existing notification system (v1.1) with a new notification type: `recommendation`.
- Recommendation notifications are always-on when Recommendation Mode is active (not toggleable independently).
- Other notification types (price spike, battery low, daily summary) continue to work independently.

---

## 5. UX Flow

### 5.1 Web Dashboard

**Recommendation Card** -- appears at the top of the dashboard when a recommendation is pending, above the status header:

```
+------------------------------------------------------------------+
| RECOMMENDATION                                    Expires in 12m |
|                                                                  |
| Discharge now -- price is 65c/kWh                                |
| Your battery is at 82%. Discharging at 3.0kW would earn ~$1.95   |
| per hour at the current price. This price window is forecast to   |
| last until 5:30 PM.                                              |
|                                                                  |
| Active profile: Aggressive (weekday peak rule)                   |
|                                                                  |
|            [ Dismiss ]              [ Approve Discharge ]        |
+------------------------------------------------------------------+
```

**Design details:**
- Card background: `--bg-secondary` with left border colored by recommended action (`--battery-discharging` for discharge, `--battery-charging` for charge)
- "Expires in Xm" countdown in `--text-xs` / `--text-secondary`, updates every minute
- Approve button: primary style, colored by action type
- Dismiss button: secondary/ghost style
- Card animates in (slide down, 200ms) and out (fade, 150ms)
- When no recommendation is pending, the card is not rendered (no empty state)

**Status header update:**
When Recommendation Mode is active and no recommendation is pending, the status header shows:
- Headline: "Watching for opportunities"
- Subtext: "Recommendation mode active. You'll be notified when action is needed."

**Mode control update:**
The segmented control expands to four options:
```
[ Auto ] [ Recommend ] [ Force Charge ] [ Force Discharge ]
```
- "Recommend" segment uses `--profile-balanced` (purple) background when active
- On mobile, the FAB icon changes to an eye icon when Recommendation Mode is active

### 5.2 Mobile

**Push notification (actionable):**
```
Battery Brain
Discharge now? Price is 65c/kWh
Battery at 82% -- earn ~$1.95/hr. Expires in 15 min.
[Dismiss]  [Approve]
```

- iOS: actionable notification with two buttons (UNNotificationAction)
- Android: actionable notification with two action buttons (NotificationCompat.Action)
- Tapping the notification body (not a button) opens the app to the recommendation detail view
- Notification priority: high (heads-up display)
- Notification category/channel: "Recommendations" (separate from price alerts and system alerts)

**In-app recommendation view:**
Same card as web, displayed as a bottom sheet that slides up when the app is opened with a pending recommendation. Can be dismissed by swiping down.

### 5.3 WebSocket Events

**New event: `recommendation.created`**
```json
{
  "type": "recommendation.created",
  "data": {
    "id": "rec_abc123",
    "action": "DISCHARGE",
    "reason": "Price is 65c/kWh -- above your 40c discharge threshold",
    "estimated_savings_per_hour": 1.95,
    "current_price_per_kwh": 65.0,
    "battery_soc": 82,
    "expires_at": "2026-03-25T17:45:00+11:00",
    "profile_id": "prof_peak_export",
    "profile_name": "Peak Export",
    "timestamp": "2026-03-25T17:30:00+11:00"
  }
}
```

**New event: `recommendation.resolved`**
```json
{
  "type": "recommendation.resolved",
  "data": {
    "id": "rec_abc123",
    "status": "approved",
    "resolved_at": "2026-03-25T17:32:00+11:00",
    "action_executed": true,
    "timestamp": "2026-03-25T17:32:00+11:00"
  }
}
```

`status` values: `approved`, `dismissed`, `expired`, `superseded`.

---

## 6. API Changes

### New Endpoints

#### `GET /recommendations`

Returns pending and recent recommendations.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| status | string | No | all | Filter: `pending`, `approved`, `dismissed`, `expired`, `superseded` |
| limit | int | No | 20 | Max results |

**Response 200:**
```json
{
  "recommendations": [
    {
      "id": "rec_abc123",
      "action": "DISCHARGE",
      "reason": "Price is 65c/kWh -- above your 40c discharge threshold",
      "estimated_savings_per_hour": 1.95,
      "current_price_per_kwh": 65.0,
      "battery_soc": 82,
      "status": "pending",
      "created_at": "2026-03-25T17:30:00+11:00",
      "expires_at": "2026-03-25T17:45:00+11:00",
      "resolved_at": null,
      "profile_id": "prof_peak_export",
      "profile_name": "Peak Export"
    }
  ]
}
```

#### `POST /recommendations/{id}/approve`

Approve a pending recommendation. Triggers immediate command execution.

**Response 200:**
```json
{
  "id": "rec_abc123",
  "status": "approved",
  "resolved_at": "2026-03-25T17:32:00+11:00",
  "action_executed": true,
  "execution_result": {
    "command_sent": "DISCHARGE",
    "foxess_response": "ok"
  }
}
```

**Response 409:** Recommendation already resolved or expired.
**Response 404:** Recommendation not found.

#### `POST /recommendations/{id}/dismiss`

Dismiss a pending recommendation.

**Response 200:**
```json
{
  "id": "rec_abc123",
  "status": "dismissed",
  "resolved_at": "2026-03-25T17:33:00+11:00"
}
```

**Response 409:** Recommendation already resolved or expired.

#### `GET /analytics/recommendations`

Returns recommendation analytics.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| from | ISO 8601 | No | 30 days ago | Start of range |
| to | ISO 8601 | No | now | End of range |

**Response 200:**
```json
{
  "total_recommendations": 142,
  "approved": 98,
  "dismissed": 31,
  "expired": 11,
  "superseded": 2,
  "approval_rate": 0.69,
  "estimated_savings_approved": 186.40,
  "estimated_savings_missed": 52.10,
  "avg_response_time_seconds": 124
}
```

### Modified Endpoints

#### `GET /status` -- Response additions

Add a `recommendation` field to the status response (null when no pending recommendation or when not in Recommendation Mode):

```json
{
  "recommendation": {
    "id": "rec_abc123",
    "action": "DISCHARGE",
    "reason": "Price is 65c/kWh -- above your 40c discharge threshold",
    "estimated_savings_per_hour": 1.95,
    "expires_at": "2026-03-25T17:45:00+11:00"
  }
}
```

#### `PATCH /preferences` -- New field

Add `operating_mode` to preferences:

```json
{
  "operating_mode": "recommend"
}
```

Valid values: `"auto"`, `"recommend"`. Manual overrides (force charge/discharge) are separate and transient -- they are not a persistent mode.

### Modified Decision Engine Flow

Current flow (Auto):
```
Engine computes schedule -> Executor sends command to FoxESS -> WebSocket pushes update
```

New flow (Recommend):
```
Engine computes schedule -> Check if action differs from current state
  -> If same action: no recommendation needed, continue holding
  -> If different action: Create recommendation record -> WebSocket pushes recommendation.created -> Push notification sent
  -> Wait for user response or expiry
  -> If approved: Executor sends command to FoxESS -> WebSocket pushes recommendation.resolved + schedule.update
  -> If dismissed/expired: Log outcome -> WebSocket pushes recommendation.resolved
```

Key detail: The engine continues to run every 15 minutes. If the optimal action changes while a recommendation is pending (e.g., price drops and discharge is no longer optimal), the pending recommendation is superseded and a new one may be created.

---

## 7. Data Model Changes

### New table: `recommendations`

```sql
CREATE TABLE IF NOT EXISTS recommendations (
    id                          TEXT NOT NULL PRIMARY KEY,  -- UUID, prefixed rec_
    action                      TEXT NOT NULL,              -- CHARGE, DISCHARGE, HOLD
    reason                      TEXT NOT NULL,              -- Plain English explanation
    estimated_savings_per_hour  REAL,                       -- Dollars
    price_at_creation           REAL NOT NULL,              -- c/kWh at time of recommendation
    battery_soc_at_creation     REAL NOT NULL,              -- % at time of recommendation
    profile_id                  TEXT NOT NULL REFERENCES profiles(id),
    status                      TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, dismissed, expired, superseded
    created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    expires_at                  TEXT NOT NULL,              -- ISO8601
    resolved_at                 TEXT,                       -- ISO8601, null while pending
    execution_result            TEXT                        -- JSON blob if approved and executed
);

CREATE INDEX idx_recommendations_status ON recommendations(status);
CREATE INDEX idx_recommendations_created ON recommendations(created_at);
```

### Modified table: `system_config` / preferences

Add `operating_mode` field (default: `"auto"`).

---

## 8. Push Notification Content

### Recommendation: Discharge

**Title:** Discharge now? Price is {price}c/kWh
**Body:** Battery at {soc}% -- earn ~${savings}/hr. Expires in {minutes} min.
**Actions:** [Dismiss] [Approve]
**Priority:** High (heads-up)
**Channel:** Recommendations

### Recommendation: Charge

**Title:** Charge now? Price dropped to {price}c/kWh
**Body:** Battery at {soc}% -- save ~${savings}/hr vs peak rates. Expires in {minutes} min.
**Actions:** [Dismiss] [Approve]
**Priority:** High (heads-up)
**Channel:** Recommendations

### Recommendation: Hold

**Title:** Hold battery? Price is moderate at {price}c/kWh
**Body:** Better opportunities forecast at {time}. Expires in {minutes} min.
**Actions:** [Dismiss] [Approve]
**Priority:** Medium
**Channel:** Recommendations

### Recommendation Expired

**Title:** Recommendation expired
**Body:** The {action} recommendation at {price}c/kWh expired. Battery held at {soc}%.
**Priority:** Low
**Channel:** Recommendations

---

## 9. Time-Sensitivity Window

The expiry window for a recommendation depends on the type of action and market conditions:

| Scenario | Default Window | Rationale |
|----------|---------------|-----------|
| Discharge during price spike | 15 minutes | Spike windows in the NEM are often 1-2 settlement periods (30-60 min). 15 min gives the user time to respond while still capturing most of the window. |
| Charge during price drop | 20 minutes | Low-price periods tend to last longer. Slightly more generous. |
| Hold (wait for better opportunity) | 30 minutes | Less time-critical since holding is the default non-action. |
| Discharge during forecast spike (anticipatory) | 25 minutes | Pre-positioning for a predicted spike is less urgent than reacting to an active one. |

The engine re-evaluates every 15 minutes. If a recommendation expires and the same action is still optimal, a new recommendation is created. This prevents stale recommendations from sitting indefinitely while still giving the user a fresh chance to act.

---

## 10. Edge Cases

### What if the user does not respond?
The recommendation expires after the time-sensitivity window. The system holds its current state. No FoxESS API call is made. The expired recommendation is logged. If the same action is still optimal on the next engine cycle, a new recommendation is created.

### What if the price changes while a recommendation is pending?
The engine runs every 15 minutes. If the new cycle determines a different action is optimal, the pending recommendation is set to `superseded` and a new recommendation may be created. The user is notified via WebSocket (`recommendation.resolved` with status `superseded`) and optionally a push notification: "Previous recommendation withdrawn -- conditions changed."

### What if multiple recommendations queue up?
Only one recommendation can be `pending` at a time. If the engine generates a new recommendation while one is pending, the old one is superseded. This prevents decision fatigue and ensures the user always sees the most current suggestion.

### What if the user approves after the price has changed?
The system executes the approved action immediately, even if the price has shifted since the recommendation was created. The recommendation was generated with the information available at creation time and the user made a conscious choice. However, if the recommendation has already been superseded or expired, the approval is rejected (HTTP 409).

### What if the user is in Recommendation Mode but has a calendar rule change?
Calendar rule transitions (profile changes) happen automatically -- they are not subject to recommendation approval. Only charge/discharge/hold commands require approval. This prevents blocking the system's profile scheduling on user responsiveness.

### What about the FoxESS API budget?
Expired and dismissed recommendations consume zero API calls. Only approved recommendations consume a call (for the actual command). This makes Recommendation Mode more conservative with API budget than Auto mode, since some actions the engine would have taken automatically are now not executed.

### What if the user enables Recommendation Mode and then goes to sleep?
Recommendations expire. The system holds. This is by design -- if the user is not available to approve, no action is taken. Users who want overnight optimization should use Auto mode. The daily summary notification includes a count of expired recommendations and estimated missed savings, nudging the user to switch modes if appropriate.

### What if WebSocket disconnects while a recommendation is pending?
The recommendation persists in the database. On reconnect, the client fetches current state via `GET /status` which includes any pending recommendation. The push notification serves as a backup delivery channel regardless of WebSocket state.

### What if the same action is recommended repeatedly?
If the user dismisses a DISCHARGE recommendation and the engine still thinks DISCHARGE is optimal on the next cycle, a new recommendation is created. To prevent notification fatigue, the system applies a cooldown: no more than 3 recommendations for the same action within a 1-hour window. After 3 dismissed recommendations for the same action, the system logs a "user disagrees with engine" event and stops recommending that action until conditions change materially (price moves by more than 10c/kWh or a new profile becomes active).

---

## 11. MVP Scope vs Future Enhancements

### MVP (ship with v1.1)

| Item | Description |
|------|-------------|
| Operating mode toggle | Auto / Recommend in preferences and mode control |
| Recommendation generation | Decision engine creates recommendations instead of executing in Recommend mode |
| Web dashboard card | Recommendation card with approve/dismiss buttons |
| Push notifications | Actionable notifications with approve/dismiss (requires v1.1 push infra) |
| WebSocket events | `recommendation.created` and `recommendation.resolved` |
| REST API | `GET /recommendations`, `POST /approve`, `POST /dismiss` |
| Recommendation history | Basic list on History page |
| Expiry logic | Time-based expiry with supersede-on-new-cycle |
| Cooldown | Max 3 same-action recommendations per hour |
| `GET /status` integration | Pending recommendation included in status response |

### Future Enhancements (v2.0+)

| Item | Description |
|------|-------------|
| Smart Auto/Recommend hybrid | Auto for low-value decisions (e.g., HOLD during moderate prices), Recommend only for high-value actions (e.g., discharge during spikes above $X) with a configurable threshold |
| Confidence display | Show engine confidence level on recommendations ("High confidence -- 90th percentile price" vs "Moderate -- price is near threshold boundary") |
| Recommendation analytics dashboard | Dedicated analytics view showing approval rate trends, savings captured vs missed, response time distribution |
| Auto-approve rules | "Always approve discharge when price > $1/kWh" -- user-defined rules that bypass the approval step for specific conditions |
| Snooze | "Remind me in 5 minutes" option on recommendations |
| Apple Watch / Wear OS | Recommendation approval from wrist |
| Recommendation batching | If multiple slot transitions are coming (e.g., charge now, then discharge in 30 min), present as a single "plan approval" rather than sequential recommendations |
| Learning from dismissals | If the user consistently dismisses a category of recommendation, adjust thresholds or suggest profile changes |

---

## 12. Open Questions

- [x] **Quiet hours interaction**: **RESOLVED** -- No special handling. Users can configure quiet hours on their phone's OS-level notification settings. The system sends recommendations regardless of time; the phone handles suppression. This keeps the backend simple and avoids duplicating platform notification controls.
- [x] **Recommendation sound**: **RESOLVED** -- Deferred. No custom notification sound for MVP. Standard push notification sound is sufficient. If users request differentiation, this can be revisited for a future iteration. Applies to mobile only (web uses standard browser notification API).

---

## 13. Success Metrics

| Metric | Target | Measurement Window |
|--------|--------|--------------------|
| Recommendation approval rate | >60% (indicates engine alignment with user preferences) | Rolling 30 days |
| Median response time | <3 minutes | Rolling 30 days |
| Savings capture rate (approved savings / total recommended savings) | >70% | Rolling 30 days |
| Expired recommendation rate | <15% (users are responsive) | Rolling 30 days |
| Mode adoption | >30% of active time spent in Recommendation Mode within 60 days of launch | 60 days post-launch |
| User trust progression | Users who start in Recommend mode transition to Auto mode within 30 days | Cohort analysis |
| FoxESS API budget impact | Recommendation Mode uses fewer API calls than Auto mode | Rolling daily |
