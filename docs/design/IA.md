# Battery Brain -- Information Architecture

## Core IA Principle

The user has one question: **"Is my battery saving me money right now?"**

Every screen and component should answer this within 2 seconds, then provide progressive detail on demand.

---

## Information Hierarchy

### Level 1: Glance (< 2 seconds)
- Stat pills: Battery %, Price, Savings, Solar, Profile -- colored, always visible
- Status header: plain English sentence ("Storing solar energy")
- Active aggressiveness profile badge (e.g., "Balanced until 4 PM")

### Level 2: Context (5-10 seconds)
- Decision explanation: *why* the system is doing what it's doing
- Power flow bars: FROM/TO with kW values for solar, battery, house, grid
- Forecast chart (dual-axis: kW generation + price overlay, NOW marker)
- Schedule timeline + profile schedule overlay
- Energy metric cards: 2x2 daily totals (Solar, Battery, House, Grid)

### Level 3: Detail (on demand)
- Historical savings (weekly, monthly)
- Full price history and cost breakdown (import costs vs export earnings)
- Battery cycle data
- Aggressiveness controls and calendar scheduling
- Configuration and manual overrides

---

## Web Application Structure

### Navigation

Top-level navigation is a simple horizontal nav bar. No sidebar -- the app is not complex enough to warrant one.

```
[Battery Brain]       [Profile Badge: Balanced]  [Auto/Manual Toggle]  [Theme]  [Settings]
```

The Profile Badge shows the currently active aggressiveness profile. Clicking it opens the aggressiveness controls.

### Pages

#### 1. Dashboard (/)

The primary view. Most users will never leave this page.

**Layout (desktop, 2-column grid):**

Everything important is above the fold. No wasted vertical space.

```
+-------------------------------------------------------+
| Stat Pills: [87%] [32.4c] [$2.40] [4.2kW] [Balanced] |
+-------------------------------------------------------+
| Status Header: "Storing solar energy"                 |
| "Solar exceeds demand. Topping up battery."           |
+---------------------------+---------------------------+
|     Battery Gauge         |     Power Flow Bars       |
|     87% Charging +2.4kW   |     FROM: Solar 4.2kW    |
|                           |     TO: House 2.1kW       |
|     Decision Explanation  |         Battery 2.1kW     |
+---------------------------+---------------------------+
|    Forecast Chart (dual-axis: kW + price, NOW marker) |
|    + Schedule Timeline + Profile overlay               |
+-------------------------------------------------------+
|  Energy Metric Cards (2x2)  |  Savings Summary Card   |
|  Solar  | Battery           |  $2.40 saved today      |
|  House  | Grid              |  vs $4.60 without batt   |
+---------+-------------------+-------------------------+

Mode Control: visible card on dashboard (not buried)
Profile Badge in nav bar opens quick-edit slide-out panel
```

**Layout (tablet/mobile, single column):**

```
+-------------------------------------------------------+
| Stat Pills: [87%] [32.4c] [$2.40] [4.2kW] [Balanced] |
+-------------------------------------------------------+
| Status: "Storing solar energy"                        |
+-------------------------------------------------------+
| Battery Gauge + Power Flow Bars                       |
+-------------------------------------------------------+
| Decision Explanation (collapsible)                    |
+-------------------------------------------------------+
| Forecast Chart (compact, expandable)                  |
+-------------------------------------------------------+
| Schedule Timeline                                     |
+-------------------------------------------------------+
| Energy Metric Cards (2x2)                             |
+-------------------------------------------------------+
| Savings Card                                          |
+-------------------------------------------------------+
| [Mode Control FAB in bottom-right corner]             |
```

#### 2. History (/history)

Historical data and analytics.

**Sections:**
- Period selector: Day / Week / Month / Custom range
- Savings chart (line chart, cumulative)
- Price vs action chart (what the system did at each price point)
- Energy flow summary table (solar generated, grid import/export, self-consumption)
- Battery cycle count and health estimate

#### 3. Strategy (/strategy)

Aggressiveness controls and calendar scheduling. This is where the user configures *how* the battery behaves, not just immediate manual overrides.

**Sections:**
- **Active Profile**: Current profile badge with "edit" link
- **Aggressiveness Controls**: Three sliders (Export, Preservation, Import) with presets
- **Calendar Schedule**: Weekly grid showing profile assignments by time
- **Upcoming Changes**: List of next 3 profile transitions with times

This page replaces the old price thresholds and battery limits in Settings, since those are now derived from the aggressiveness profile.

#### 4. Settings (/settings)

Configuration for notifications, connections, and preferences.

**Sections:**
- **Notifications**: Price spike threshold, battery alerts on/off, quiet hours
- **API connections**: FoxESS API key status, Amber Electric API key status
- **Theme**: Light / Dark / System
- **Data export**: CSV download of historical data

---

## Mobile Application Structure

### Navigation

Bottom tab bar with 4 tabs:

```
[Dashboard]    [Strategy]    [History]    [Settings]
```

### Screens

#### 1. Dashboard (Tab 1)

Same content as web dashboard but optimized for vertical scroll and touch:

- Stat pills at top (always visible, horizontally scrollable)
- Status header with plain English state description
- Battery gauge (centered) + power flow bars
- Decision explanation (tappable to expand/collapse)
- Forecast chart (compact, tappable to expand to full dual-axis view)
- Schedule timeline with profile overlay
- Energy metric cards (2x2 grid)
- Savings card with cost breakdown
- Mode control: Floating Action Button (FAB) in bottom-right, always visible

#### 2. Strategy (Tab 2)

Aggressiveness controls and calendar schedule, optimized for touch:

- Preset selector as large tappable pills (Conservative / Balanced / Aggressive)
- Three sliders with large touch targets (44px minimum)
- Impact summary below sliders
- Calendar: horizontal scrollable day columns, vertical hours
- Tap a time block to add/edit a rule via bottom sheet

#### 3. History (Tab 3)

- Period selector (segmented control)
- Savings chart
- Energy summary cards (swipeable)

#### 4. Settings (Tab 4)

- Notifications, API connections, theme, data export (native list format)

### Push Notification Types

| Notification | Trigger | Priority |
|-------------|---------|----------|
| Price spike | Price exceeds user threshold | High |
| Price drop | Price drops below charge threshold | Medium |
| Battery full | SoC reaches 100% | Low |
| Battery low | SoC below reserve minimum | High |
| Mode change | System switches charge/discharge/idle | Low |
| Daily summary | End of day savings report | Low |

### Mobile Widget (iOS/Android Home Screen)

Single-row compact display:

```
[Battery 87%] [32c] [Auto] [$2.40]
```

Background color reflects current price signal. Tapping opens the app.

---

## Data Refresh Strategy

| Data | Refresh Interval | Method |
|------|-----------------|--------|
| Battery SoC | 30 seconds | WebSocket or poll |
| Current price | 5 minutes (Amber interval) | WebSocket or poll |
| Price forecast | 5 minutes | Poll |
| Schedule | On change or 5 minutes | WebSocket |
| Savings | 5 minutes | Poll |
| Power flow | 30 seconds | WebSocket or poll |

Web dashboard uses WebSocket for real-time updates. Mobile uses a combination of WebSocket (when app is open) and push notifications (background).

---

## User Flows

### Flow 1: Morning Check (most common)

1. Open app/dashboard
2. See battery SoC, current price, today's savings (Level 1 -- 2 seconds)
3. Glance at price forecast to see if expensive period coming
4. Close app. Total time: < 10 seconds.

### Flow 2: Price Spike Response

1. Receive push notification: "Price spike: 85c/kWh"
2. Open app -- see system is already discharging (auto mode)
3. Optionally verify schedule looks correct
4. Close app. Total time: < 15 seconds.

### Flow 3: Manual Override

1. Open app -- see price is cheap but system is not charging (perhaps solar is sufficient)
2. Tap "Force Charge" in mode control
3. Select duration (e.g., 1 hour)
4. Confirm. System begins charging.
5. Close app. Total time: < 20 seconds.

### Flow 4: Weekly Review

1. Open History tab
2. Select "This Week"
3. Review total savings, solar generation, grid usage
4. Compare to previous week
5. Optionally adjust aggressiveness profile in Strategy

### Flow 5: Set Up Recurring Schedule

1. Open Strategy tab/page
2. See current aggressiveness sliders and calendar
3. Tap an empty time block on the calendar (e.g., Weekdays 4-8 PM)
4. Select "Aggressive" preset in the popover
5. Set recurrence to "Weekdays"
6. Save. Calendar shows amber blocks for weekday 4-8 PM.
7. Total time: < 30 seconds.

### Flow 6: One-Off Override for Tomorrow

1. Open Strategy tab/page
2. Switch calendar to date view, select tomorrow
3. Tap the time block to override (e.g., 10 AM - 2 PM)
4. Select "Conservative" (expecting guests, want backup power)
5. Confirm as one-off override
6. Calendar shows striped blue block for that period
7. Total time: < 20 seconds.

### Flow 7: Quick Profile Change from Dashboard

1. On dashboard, tap the Profile Badge in the header ("Balanced")
2. Slide-out panel shows aggressiveness controls
3. Tap "Aggressive" preset pill
4. Impact summary updates immediately
5. Close panel. Badge now shows "Aggressive".
6. Total time: < 10 seconds.

---

## Design Differentiation (vs Amber VPP)

What we take from Amber and what we do better.

### Adopted patterns (adapted, not copied)
- **Stat pills**: Quick-scan metric row (Battery %, Price, Solar, Savings, Profile)
- **Power flow bars**: Horizontal FROM/TO bars with kW values -- simpler than our original node diagram
- **Energy metric cards**: 2x2 colored cards for Solar/Battery/House/Grid daily totals
- **Dual-axis forecast chart**: kW generation + price overlay with NOW marker
- **Decision explanations**: Plain English text explaining current battery behavior
- **Natural language status**: "Storing solar energy" headline, not just "Charging"

### Where we are better
1. **Savings-first framing**: Lead with "$2.40 saved" not "Total cost $1.20". Positive framing builds engagement.
2. **Schedule visibility**: Our schedule timeline + profile overlay is always visible on the dashboard. Amber has no visible schedule. This is a core differentiator.
3. **Mode control accessibility**: Amber buries "CONTROL MY BATTERY" in a separate tab. Our mode control is a visible card on web and a FAB (always one tap away) on mobile.
4. **Aggressiveness profiles**: Our Strategy page with three intuitive sliders and a calendar scheduler is far richer than Amber's "SmartShift Settings" link. It feels integrated, not hidden.
5. **Information density**: No wasted gradient header. Stat pills + status header + power flow all pack into the first screen height. Every pixel earns its place.
6. **Chart integration**: Our forecast chart shows price bars + solar area + house line in one view with sensible defaults, instead of requiring users to toggle layers on/off separately.
7. **Cost breakdown transparency**: We show import costs vs export earnings in the savings card, not just a total number. Users understand *where* their savings come from.
