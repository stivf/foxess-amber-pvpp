# Battery Brain Design System

## Design Principles

1. **Savings-first** -- Lead with positive framing: "You saved $X" not "Total cost $Y"
2. **Glanceable** -- Battery status and savings visible within 2 seconds
3. **Explainable** -- Plain English descriptions of what the system is doing and why
4. **Signal-driven** -- Color communicates action (charge/hold/discharge) instantly
5. **Dense above the fold** -- Pack useful information tight; no decorative gradients or wasted space
6. **Consistent** -- Shared tokens across web and mobile

---

## Design Tokens

### Color Palette

#### Price Heat-Map Colors (Core Signal System)

These colors are the primary communication mechanism. They map directly to battery actions.

| Token | Hex | Usage |
|-------|-----|-------|
| `--price-cheap-3` | `#064E3B` | Extremely cheap -- strong charge signal |
| `--price-cheap-2` | `#059669` | Very cheap -- charge |
| `--price-cheap-1` | `#34D399` | Cheap -- light charge signal |
| `--price-neutral` | `#6B7280` | Mid-range -- hold |
| `--price-expensive-1` | `#F87171` | Expensive -- light discharge signal |
| `--price-expensive-2` | `#DC2626` | Very expensive -- discharge |
| `--price-expensive-3` | `#991B1B` | Extremely expensive -- strong discharge signal |

#### Price Threshold Mapping

| Price Range (c/kWh) | Token | Action |
|---------------------|-------|--------|
| < 5 | `--price-cheap-3` | Force charge |
| 5 - 15 | `--price-cheap-2` | Charge |
| 15 - 25 | `--price-cheap-1` | Opportunistic charge |
| 25 - 35 | `--price-neutral` | Hold |
| 35 - 50 | `--price-expensive-1` | Light discharge |
| 50 - 80 | `--price-expensive-2` | Discharge |
| > 80 | `--price-expensive-3` | Aggressive discharge |

Note: Negative prices (common in AU market) use `--price-cheap-3` with a special "negative price" indicator.

#### Battery State Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--battery-charging` | `#059669` | Battery is charging (green) |
| `--battery-discharging` | `#DC2626` | Battery is discharging (red) |
| `--battery-idle` | `#6B7280` | Battery is idle/holding (gray) |
| `--battery-full` | `#059669` | SoC >= 95% |
| `--battery-high` | `#34D399` | SoC 60-94% |
| `--battery-mid` | `#FBBF24` | SoC 30-59% |
| `--battery-low` | `#F87171` | SoC 10-29% |
| `--battery-critical` | `#991B1B` | SoC < 10% |

#### Energy Source Colors (Metric Cards)

Distinct colors for the four energy sources, used in metric cards and power flow bars. Each has a main color and a lighter tint (15% opacity) for card backgrounds.

| Token | Hex | Usage |
|-------|-----|-------|
| `--energy-solar` | `#EAB308` | Solar generation (yellow/gold) |
| `--energy-solar-tint` | `#EAB30826` | Solar card background |
| `--energy-battery` | `#06B6D4` | Battery (cyan) |
| `--energy-battery-tint` | `#06B6D426` | Battery card background |
| `--energy-house` | `#3B82F6` | House consumption (blue) |
| `--energy-house-tint` | `#3B82F626` | House card background |
| `--energy-grid` | `#EC4899` | Grid import/export (pink) |
| `--energy-grid-tint` | `#EC489926` | Grid card background |

#### UI Colors -- Light Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#FFFFFF` | Page background |
| `--bg-secondary` | `#F9FAFB` | Card/section background |
| `--bg-tertiary` | `#F3F4F6` | Inset/input background |
| `--text-primary` | `#111827` | Primary text |
| `--text-secondary` | `#6B7280` | Secondary/muted text |
| `--text-tertiary` | `#9CA3AF` | Placeholder/disabled text |
| `--border-default` | `#E5E7EB` | Default borders |
| `--border-strong` | `#D1D5DB` | Emphasized borders |

#### UI Colors -- Dark Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#111827` | Page background |
| `--bg-secondary` | `#1F2937` | Card/section background |
| `--bg-tertiary` | `#374151` | Inset/input background |
| `--text-primary` | `#F9FAFB` | Primary text |
| `--text-secondary` | `#9CA3AF` | Secondary/muted text |
| `--text-tertiary` | `#6B7280` | Placeholder/disabled text |
| `--border-default` | `#374151` | Default borders |
| `--border-strong` | `#4B5563` | Emphasized borders |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-family` | `'Inter', system-ui, sans-serif` | All text |
| `--font-mono` | `'JetBrains Mono', monospace` | Numbers, prices, percentages |
| `--text-xs` | `0.75rem / 12px` | Labels, timestamps |
| `--text-sm` | `0.875rem / 14px` | Secondary content |
| `--text-base` | `1rem / 16px` | Body text |
| `--text-lg` | `1.125rem / 18px` | Card headings |
| `--text-xl` | `1.25rem / 20px` | Section headings |
| `--text-2xl` | `1.5rem / 24px` | Page headings |
| `--text-4xl` | `2.25rem / 36px` | Hero numbers (SoC%, price) |
| `--font-weight-normal` | `400` | Body text |
| `--font-weight-medium` | `500` | Labels, sub-headings |
| `--font-weight-semibold` | `600` | Headings |
| `--font-weight-bold` | `700` | Hero numbers |

Key rule: All numerical values (prices, percentages, watts) use `--font-mono` for tabular alignment and clarity.

### Spacing

Based on 4px grid:

| Token | Value |
|-------|-------|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--space-10` | `40px` |
| `--space-12` | `48px` |
| `--space-16` | `64px` |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `4px` | Small elements, badges |
| `--radius-md` | `8px` | Cards, inputs |
| `--radius-lg` | `12px` | Modals, large cards |
| `--radius-full` | `9999px` | Pills, circular indicators |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | Cards |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |

### Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `--bp-mobile` | `< 640px` | Mobile phones |
| `--bp-tablet` | `640px - 1023px` | Tablets |
| `--bp-desktop` | `1024px - 1279px` | Desktop |
| `--bp-wide` | `>= 1280px` | Wide desktop |

---

## Component Specifications

### 1. Status Header

Natural language description of what the system is doing and why. This is the first thing the user reads. It builds trust by making the system's decisions transparent.

**Structure:**
- Headline: plain English summary of current state in `--text-lg` / `--font-weight-semibold`
- Subtext: one-line explanation of *why* in `--text-sm` / `--text-secondary`
- Background: `--bg-secondary` with left border colored by current action

**Template sentences (generated from system state):**

| State | Headline | Subtext |
|-------|----------|---------|
| Charging from solar | "Storing solar energy" | "Solar generation exceeds house demand. Topping up battery." |
| Charging from grid | "Charging from grid" | "Price is 8c/kWh -- well below your 20c threshold." |
| Discharging to house | "Powering your home from battery" | "Grid price is 52c/kWh. Saving you $0.44/kWh right now." |
| Exporting to grid | "Selling energy to the grid" | "Price spiked to 85c/kWh. Earning 85c for each kWh exported." |
| Idle / holding | "Holding charge" | "Price is moderate. Waiting for a better opportunity." |
| Self-consumption | "Self-consumption mode" | "Slowly charging from solar. Battery will be full by 2 PM." |

**Sizing:**
- Web: full-width, first element in dashboard, ~60px height
- Mobile: below summary pills, ~50px height
- No wasted space -- compact, no gradient, no decorative elements

### 2. Stat Pills

A row of colored pill badges showing key metrics at a glance. Inspired by Amber's quick-stat row but more information-dense.

**Structure:**
- Horizontal row of 4-5 pills, evenly spaced
- Each pill: `[icon] [value] [unit]`
- Pill background: tinted version of metric color (15% opacity)
- Pill text: metric color at full saturation
- Font: `--text-sm` / `--font-mono` for values, `--text-xs` for units
- Border radius: `--radius-full` (pill shape)
- Padding: `--space-2` vertical, `--space-3` horizontal

**Pills (in order):**

| Pill | Icon | Example | Color |
|------|------|---------|-------|
| Battery | battery icon | `87%` | SoC color token |
| Price | zap icon | `32.4c` | Price heat-map token |
| Savings | dollar icon | `$2.40` | `--price-cheap-2` (green) |
| Solar | sun icon | `4.2kW` | `--energy-solar` |
| Profile | shield/zap icon | `Balanced` | Profile color token |

**Sizing:**
- Web: in the header/nav area or as first row in dashboard
- Mobile: replaces the old summary bar; horizontal scroll if needed
- Tablet: same as web

**Tap behavior:**
- Tapping a pill scrolls to / highlights the relevant dashboard section
- Tapping Profile pill opens quick-edit panel (same as Profile Badge)

### 3. Battery Gauge

The primary battery visualization. Prominent but compact.

**Structure:**
- Vertical or circular gauge showing SoC percentage
- Large numeric display: `87%` in `--text-4xl` / `--font-mono` / `--font-weight-bold`
- Color fill matches SoC level tokens (`--battery-full` through `--battery-critical`)
- State indicator badge below: "Charging", "Discharging", or "Idle"
- Badge background uses `--battery-charging`, `--battery-discharging`, or `--battery-idle`
- Power flow value: "+2.4 kW" or "-3.1 kW" in `--font-mono`

**Sizing:**
- Web: 180px wide, prominent placement in top-left card
- Mobile: 120px wide, centered below stat pills

**Animation:**
- SoC fill transitions smoothly (300ms ease) on value change
- Charging state: subtle pulse animation on the badge (not the gauge)
- No animation when idle

### 4. Price Display

Current spot price with contextual color.

**Structure:**
- Price in `--text-4xl` / `--font-mono` / `--font-weight-bold`
- Unit label "c/kWh" in `--text-sm` / `--text-secondary`
- Background color from price heat-map palette based on current price
- Text color: white on dark backgrounds (`--price-cheap-3`, `--price-expensive-2/3`), dark on light
- Direction arrow: up/down indicator showing trend vs last interval
- Feed-in tariff shown below in `--text-sm`: "Feed-in: 8.5 c/kWh"

**Sizing:**
- Web: card format, same row as battery gauge
- Mobile: compact inline format in stat pills

### 5. Power Flow Bars

Horizontal bar visualization showing energy flow between sources. Simpler and more compact than a node/arrow diagram. Directly shows FROM and TO with kW values.

**Structure:**
- Two sections: FROM (sources) and TO (destinations)
- Each bar is a horizontal fill bar with a label and kW value
- Bar width proportional to kW value
- Bar color uses energy source tokens

**FROM section:**
```
FROM
  Solar    [=============================] 4.2 kW
  Grid     [====]                          0.8 kW
  Battery  [  ]                            0.0 kW
```

**TO section:**
```
TO
  House    [===============]               2.1 kW
  Battery  [=============]                 2.1 kW
  Grid     [====]                          0.8 kW
```

**Bar Design:**
- Height: 24px per bar
- Background: energy source tint color
- Fill: energy source main color
- Label: left-aligned, `--text-sm` / `--font-weight-medium`
- Value: right-aligned, `--text-sm` / `--font-mono`
- Zero-value bars: show a thin 2px line (not hidden) to maintain layout consistency
- Active flow bars have a subtle animation (gentle pulse on the fill)

**Sizing:**
- Web: card format (50% width), same row as battery gauge + price, ~180px height
- Mobile: 50% width card alongside battery gauge, ~130px height
- Compact enough to sit above the fold

### 6. Energy Metric Cards

Four colored cards in a 2x2 grid showing daily energy totals. Bold, colorful, easy to scan.

**Structure:**
- 2x2 grid of cards, one per energy source
- Each card has:
  - Icon (top left) in the energy source color
  - Label: "Solar", "Battery", "House", "Grid" in `--text-sm` / `--font-weight-medium`
  - Value: "12.4 kWh" in `--text-xl` / `--font-mono` / `--font-weight-bold`
  - Sub-detail in `--text-xs` / `--text-secondary`
- Card background: energy source tint color
- Left border: 3px solid energy source main color

**Card details:**

| Card | Color | Value | Sub-detail |
|------|-------|-------|------------|
| Solar | `--energy-solar` | Generated kWh | "Peak: 4.2 kW at 12:30" |
| Battery | `--energy-battery` | Net charged/discharged kWh | "0.8 cycles today" |
| House | `--energy-house` | Consumed kWh | "Avg: 1.4 kW" |
| Grid | `--energy-grid` | Net import/export kWh | "Exported 5.1, Imported 3.2" |

**Sizing:**
- Web: 2x2 grid within a card, each sub-card ~200px wide
- Mobile: 2x2 grid, each sub-card ~full half-width
- Compact: ~120px height per sub-card

### 7. Forecast Chart (Dual-Axis)

Enhanced price forecast chart with dual axes: power (kW) on the left and price (c/kWh) on the right. Shows generation, consumption, and price together with a NOW marker.

**Structure:**
- X-axis: time (30-min intervals), spanning 24-48 hours
- Left Y-axis: power in kW (solar generation, house consumption)
- Right Y-axis: price in c/kWh
- NOW marker: bold vertical dashed line at current time, labeled "NOW"

**Layers (all shown by default, toggleable):**
- **Price bars**: colored using price heat-map tokens (background layer)
- **Solar generation**: yellow area fill (`--energy-solar` at 30% opacity) with solid line
- **House consumption**: blue line (`--energy-house`)
- **Battery plan**: green/red markers for planned charge/discharge actions

**Interaction:**
- Hover (web) / tap (mobile): tooltip showing all values at that time interval
- Tooltip: "2:30 PM -- Price: 45c, Solar: 3.2kW, House: 1.8kW, Plan: Discharge"
- No separate toggle buttons needed -- layers have distinct visual styles that are readable when overlaid
- If a layer obscures others, user can tap the legend label to dim it (50% opacity)

**Chart defaults:**
- Price bars always visible (primary information)
- Solar area always visible
- House line visible on web, hidden by default on mobile (can expand)

**Sizing:**
- Web: full-width card, ~320px height
- Tablet: full-width, ~240px height
- Mobile: full-width, ~160px height (shows price bars + solar; tap to expand to full chart)

**Chart Library:** Recharts (web), Victory Native (mobile) -- both support dual axes

### 8. Schedule Timeline

Visual representation of planned charge/discharge actions for the day.

**Structure:**
- Horizontal timeline spanning 24 hours
- Colored blocks using battery state colors for planned actions
- Current time indicator (vertical line)
- Labels on blocks: "Charge", "Discharge", "Hold"
- Tappable blocks reveal details (source: grid/solar, target SoC)

**Sizing:**
- Web: full-width, ~100px height (2 rows when profile overlay is shown), below forecast chart
- Mobile: same width, ~70px height (2 rows)

### 9. Savings Summary Card

Today's financial performance at a glance. Savings-first framing -- lead with the positive number.

**Structure:**
- Primary number: "Today's savings" in `--text-2xl` / `--font-mono` / `--font-weight-bold`
- Format: `$X.XX` with `--price-cheap-2` color (green)
- Comparison line: "vs $Y.YY without battery" in `--text-sm` / `--text-secondary`
- Cost breakdown (below, in `--text-sm`):
  - "Import costs: -$X.XX" (what you paid the grid)
  - "Export earnings: +$X.XX" (what the grid paid you)
  - "Net cost: $X.XX"
- Period selector: Today / This Week / This Month

This card frames everything positively: savings first, then the breakdown. Never lead with "Total Cost."

### 10. Decision Explanation

Plain English explanation of the system's current decision. Builds user trust by making the optimization logic transparent.

**Structure:**
- Container: `--bg-secondary` background, `--radius-md`, `--space-4` padding
- Text: `--text-sm` / `--text-primary`
- Format: 2-3 sentences explaining the current decision and the reasoning

**Example texts:**

```
Your battery is in self-consumption mode. It is slowly charging from
solar and will be full by 2:00 PM. The system is holding charge for
the afternoon peak when prices are forecast to reach 65c/kWh.
```

```
Grid price dropped to 8c/kWh -- below your 20c import threshold.
Charging from grid at 3.0 kW. Battery will reach 80% in about 45
minutes.
```

```
Prices are moderate right now (32c/kWh). Holding battery at 87%.
Next scheduled action: Discharge starting at 4:00 PM when prices
are forecast to spike above 50c/kWh.
```

**Placement:**
- Web: below the status header, or as a collapsible section within the battery gauge card
- Mobile: below the stat pills, tappable to expand/collapse
- Always visible (not hidden behind a tap) -- this is a differentiator

### 11. Mode Control (Enhanced)

Manual override controls. More accessible than Amber's buried "CONTROL MY BATTERY."

**Structure:**
- Three-way segmented control: `Auto` | `Force Charge` | `Force Discharge`
- Active segment uses corresponding color token
- Auto mode: `--bg-tertiary` background
- Force Charge: `--battery-charging` background
- Force Discharge: `--battery-discharging` background
- Confirmation dialog for manual overrides with duration picker
- Duration options: 30 min, 1 hour, 2 hours, Until next schedule

**Accessibility improvements over Amber:**
- Web: Mode control is in a visible card on the dashboard (not buried in a separate tab)
- Mobile: Floating Action Button (FAB) in bottom-right corner, above tab bar
  - FAB shows current mode icon (auto=circle, charge=arrow-down, discharge=arrow-up)
  - FAB color matches current mode
  - Tapping FAB opens a bottom sheet with the three-way control + duration picker
  - This makes manual override always one tap away from any screen

### 12. Status Bar (Mobile Widget)

Compact summary for quick glance on home screen.

**Structure:**
- Single row: `[Battery Icon 87%] [Price 32c] [Balanced] [$2.40 saved]`
- Background color reflects current price signal
- Tapping opens the app

### 13. Notification Cards

Alert display for price events and system status.

**Structure:**
- Icon + Title + Message + Timestamp
- Types with corresponding left-border colors:
  - Price spike: `--price-expensive-2`
  - Price drop: `--price-cheap-2`
  - Battery full/empty: `--battery-full` / `--battery-critical`
  - System alert: `--text-secondary`
- Dismissable with swipe (mobile) or X button (web)

---

## Theme System

### Implementation

Use CSS custom properties with `data-theme` attribute on root element.

```
:root (or data-theme="light")  -> light tokens
[data-theme="dark"]            -> dark tokens
```

System preference detection via `prefers-color-scheme` media query as default. User override stored in localStorage (web) or AsyncStorage (mobile).

The price heat-map and battery state colors remain the same in both themes -- they are semantic/signal colors that should not change with theme.

### Theme Toggle

Place in the top-right of the header/nav bar. Simple icon toggle (sun/moon) rather than a three-way switch, since this is a personal tool. System preference is the default; toggling overrides it.

#### Profile Colors

Each aggressiveness profile gets a distinct, muted color for calendar visualization and dashboard badges.

| Token | Hex | Usage |
|-------|-----|-------|
| `--profile-conservative` | `#3B82F6` | Conservative profile (blue -- safe, stable) |
| `--profile-balanced` | `#8B5CF6` | Balanced profile (purple -- neutral) |
| `--profile-aggressive` | `#F59E0B` | Aggressive profile (amber -- active, bold) |
| `--profile-custom` | `#EC4899` | Custom profile (pink -- user-defined) |

---

## Component Specifications (continued)

### 14. Aggressiveness Controls

Three independent axes controlling how the optimization engine behaves. Each axis is a discrete 5-stop slider with clear labels.

**The Three Axes:**

| Axis | What it controls | Conservative end | Aggressive end |
|------|-----------------|-------------------|----------------|
| **Export** | Eagerness to sell to grid | Prefer to keep stored energy | Sell whenever profitable |
| **Preservation** | Battery reserve level | Keep high reserve (backup power) | Use full capacity for trading |
| **Import** | Eagerness to charge from grid | Only charge when very cheap | Charge more often at moderate prices |

**Slider Design:**

Each axis is a horizontal track with 5 labeled stops:

```
Export
[1]------[2]------[3]------[4]------[5]
 Keep     Cautious Balanced Eager    Max
                      *
"Sell only during     "Sell whenever
 extreme spikes"       price is above
                       feed-in rate"
```

- Track: 4px height, `--bg-tertiary` background, `--radius-full` corners
- Active fill: gradient from `--profile-conservative` (left) to `--profile-aggressive` (right)
- Handle: 20px circle, `--bg-primary` fill, `--border-strong` border, `--shadow-sm`
- Stop labels below track in `--text-xs` / `--text-secondary`
- Current value label above handle in `--text-sm` / `--font-weight-medium`
- Each stop has a concise tooltip explaining practical impact

**Stop Definitions:**

Export axis:
1. **Keep** -- Only export when battery is full and solar is generating
2. **Cautious** -- Export during price spikes above 60c/kWh
3. **Balanced** -- Export when price exceeds 40c/kWh
4. **Eager** -- Export when price exceeds feed-in rate + margin
5. **Max** -- Export whenever price is above feed-in rate

Preservation axis:
1. **Max Reserve** -- Keep 80% minimum SoC (maximum backup)
2. **High Reserve** -- Keep 50% minimum SoC
3. **Balanced** -- Keep 30% minimum SoC
4. **Low Reserve** -- Keep 15% minimum SoC
5. **Full Use** -- Keep 5% minimum SoC (maximize trading)

Import axis:
1. **Minimal** -- Only charge when price is negative or < 5c/kWh
2. **Cautious** -- Charge below 10c/kWh
3. **Balanced** -- Charge below 20c/kWh
4. **Eager** -- Charge below 30c/kWh
5. **Max** -- Charge whenever price is below average forecast

**Practical Impact Display:**

Below the three sliders, show a real-time impact summary:

```
With these settings:
  Reserve:    30% (2.7 kWh backup for ~2h)
  Export:     When price > 40c/kWh
  Import:     When price < 20c/kWh
  Est. daily: $2.10 - $3.80 savings (based on last 7 days)
```

This uses `--text-sm`, `--bg-secondary` background, `--radius-md` border radius.

**Presets:**

Three named presets as pill buttons above the sliders:

```
[Conservative]  [Balanced]  [Aggressive]  [Custom]
```

- Each preset sets all three sliders to pre-defined positions
- "Custom" activates automatically when user moves any slider away from a preset
- Active preset pill uses its profile color (`--profile-conservative`, etc.)
- Inactive pills use `--bg-tertiary` background

| Preset | Export | Preservation | Import |
|--------|--------|-------------|--------|
| Conservative | 1 (Keep) | 1 (Max Reserve) | 1 (Minimal) |
| Balanced | 3 (Balanced) | 3 (Balanced) | 3 (Balanced) |
| Aggressive | 5 (Max) | 5 (Full Use) | 5 (Max) |

**Sizing:**
- Web: full card width (~600px max), each slider ~500px track width
- Mobile: full screen width with `--space-4` padding, each slider full width

### 15. Profile Badge (Dashboard)

Compact indicator of the currently active aggressiveness profile, shown on the dashboard.

**Structure:**
- Pill-shaped badge: `[icon] Profile Name`
- Background: profile color at 15% opacity
- Text: profile color at full saturation
- Font: `--text-sm` / `--font-weight-medium`
- If scheduled: additional text "until 8:00 PM" in `--text-xs` / `--text-tertiary`
- Tapping/clicking opens the aggressiveness controls

**Examples:**
- `[shield] Conservative until 4:00 PM`
- `[zap] Aggressive`
- `[sliders] Custom (E3 P2 I4)`

**Placement:**
- Web: in the header bar, between the app title and theme toggle
- Mobile: in the summary bar, replacing the static "Auto" label

### 16. Calendar Schedule View

Visual weekly calendar for scheduling aggressiveness profiles across time.

**Structure -- Week View (primary):**

A 7-column grid (Mon-Sun) with 24 rows (hours). Each cell can be assigned a profile.

- Column headers: day names in `--text-sm` / `--font-weight-medium`
- Row labels: hours in `--text-xs` / `--text-secondary` (show every 2 hours to reduce clutter)
- Cells: colored blocks using profile colors at 30% opacity
- Current time: horizontal red line across today's column
- Default (unscheduled time): uses the "base" profile shown in `--bg-tertiary`

**Interaction -- Adding a Schedule Rule:**

1. Click/tap a time block or drag to select a range
2. A popover appears with:
   - Profile selector (Conservative / Balanced / Aggressive / Custom)
   - Time range (pre-filled from selection): start time, end time
   - Recurrence: `[Every day] [Weekdays] [Weekends] [Custom days]` segmented control
   - Delete button (if editing existing rule)
   - Save / Cancel buttons
3. On save, the calendar updates immediately with the colored block

**Interaction -- Editing:**
- Click an existing block to edit its rule
- Drag edges of a block to resize (web only)
- Long-press (mobile) or right-click (web) for delete option

**One-off Overrides:**

- A date picker at the top allows switching from "Recurring" to "Specific date" view
- One-off overrides show as blocks with a diagonal stripe pattern over the recurring color
- Override blocks include a small "1x" badge to distinguish from recurring rules
- Overrides expire automatically after their time passes

**Rule Priority:**
1. Active manual override (from Mode Control) -- highest
2. One-off calendar override
3. Recurring calendar rule
4. Base profile (default) -- lowest

**Month View (secondary):**

A smaller month calendar for viewing/managing one-off overrides:
- Each day cell shows a small color bar of the dominant profile for that day
- Days with overrides show a dot indicator
- Tapping a day switches the week view to that week

**Sizing:**
- Web: full-width card, ~500px height for week view, scrollable
- Mobile: full-screen view (pushed from Settings), horizontal scroll for days

### 17. Active Schedule Indicator (Dashboard)

Shows upcoming profile changes on the main dashboard, integrated with the schedule timeline.

**Structure:**
- Extends the existing Schedule Timeline (Component 4) with a second row
- Top row: charge/discharge/hold actions (existing)
- Bottom row: profile blocks colored by profile color

```
Actions:  |==CHARGE==|====HOLD====|==DISCHARGE==|===CHARGE===|
Profile:  |==Conservative==|=====Aggressive======|==Balanced==|
          6a              4p                    9p           12a
```

- Profile blocks use profile colors at 30% opacity
- Transition points between profiles marked with a small vertical tick
- Current profile highlighted with full opacity

---

## Shared TypeScript Token Export

Frontend and mobile teams should consume tokens from a shared package:

```
shared/
  tokens/
    colors.ts      -- all color tokens as constants
    typography.ts   -- font sizes, weights, families
    spacing.ts      -- spacing scale
    breakpoints.ts  -- breakpoint values
    index.ts        -- re-exports
```

### Example: colors.ts structure

```typescript
export const priceColors = {
  cheap3: '#064E3B',
  cheap2: '#059669',
  cheap1: '#34D399',
  neutral: '#6B7280',
  expensive1: '#F87171',
  expensive2: '#DC2626',
  expensive3: '#991B1B',
} as const;

export const batteryStateColors = {
  charging: '#059669',
  discharging: '#DC2626',
  idle: '#6B7280',
} as const;

export const batterySocColors = {
  full: '#059669',
  high: '#34D399',
  mid: '#FBBF24',
  low: '#F87171',
  critical: '#991B1B',
} as const;

// Helper: get price color from c/kWh value
export function getPriceColor(pricePerKwh: number): string {
  if (pricePerKwh < 5) return priceColors.cheap3;
  if (pricePerKwh < 15) return priceColors.cheap2;
  if (pricePerKwh < 25) return priceColors.cheap1;
  if (pricePerKwh < 35) return priceColors.neutral;
  if (pricePerKwh < 50) return priceColors.expensive1;
  if (pricePerKwh < 80) return priceColors.expensive2;
  return priceColors.expensive3;
}

// Helper: get battery SoC color from percentage
export function getBatterySocColor(socPercent: number): string {
  if (socPercent >= 95) return batterySocColors.full;
  if (socPercent >= 60) return batterySocColors.high;
  if (socPercent >= 30) return batterySocColors.mid;
  if (socPercent >= 10) return batterySocColors.low;
  return batterySocColors.critical;
}

export const energySourceColors = {
  solar: '#EAB308',
  battery: '#06B6D4',
  house: '#3B82F6',
  grid: '#EC4899',
} as const;

export const profileColors = {
  conservative: '#3B82F6',
  balanced: '#8B5CF6',
  aggressive: '#F59E0B',
  custom: '#EC4899',
} as const;

// Aggressiveness profile type
export interface AggressivenessProfile {
  name: 'conservative' | 'balanced' | 'aggressive' | 'custom';
  export: 1 | 2 | 3 | 4 | 5;       // 1=Keep, 5=Max export
  preservation: 1 | 2 | 3 | 4 | 5;  // 1=Max reserve, 5=Full use
  import: 1 | 2 | 3 | 4 | 5;        // 1=Minimal, 5=Max import
}

// Schedule rule type
export interface ScheduleRule {
  id: string;
  profile: AggressivenessProfile;
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  recurrence: 'daily' | 'weekdays' | 'weekends' | number[];  // number[] = specific days (0=Mon)
  overrideDate?: string;  // ISO date for one-off overrides
}

export const presetProfiles: Record<string, AggressivenessProfile> = {
  conservative: { name: 'conservative', export: 1, preservation: 1, import: 1 },
  balanced: { name: 'balanced', export: 3, preservation: 3, import: 3 },
  aggressive: { name: 'aggressive', export: 5, preservation: 5, import: 5 },
};
```

---

## Accessibility

- All price colors meet WCAG AA contrast against their text colors (white text on dark price backgrounds, dark text on light)
- Battery gauge includes numeric percentage -- never rely on color alone
- Mode control buttons have text labels, not just colors
- Chart tooltips accessible via keyboard (web)
- Motion: respect `prefers-reduced-motion` -- disable pulse animations
- Screen reader: announce battery state changes and price alerts
