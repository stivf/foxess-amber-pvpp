# Battery Brain -- Wireframes

Text-based wireframes for key screens across web and mobile.

---

## Web Dashboard -- Desktop (1280px+)

```
+========================================================================+
| [*] Battery Brain    [Balanced until 4p]     [Auto v] [sun/moon] [gear]|
+========================================================================+
|                                                                        |
|  [87%]  [32.4c/kWh]  [$2.40 saved]  [4.2kW solar]  [Balanced]         |
|  (stat pills -- colored by respective metric)                          |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | > Storing solar energy                                           |  |
|  |   Solar generation exceeds house demand. Topping up battery.     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +------------------------------+  +-------------------------------+   |
|  |                              |  |                               |   |
|  |        +-----------+         |  |  Power Flow                   |   |
|  |        |           |         |  |                               |   |
|  |        |   ####    |         |  |  FROM                         |   |
|  |        |   ####    |         |  |  Solar  [===============] 4.2 |   |
|  |        |   ####    |  87%    |  |  Grid   [==]              0.8 |   |
|  |        |   ####    |         |  |                               |   |
|  |        +-----------+         |  |  TO                           |   |
|  |                              |  |  House  [========]        2.1 |   |
|  |     [ Charging +2.4kW ]     |  |  Batt.  [========]        2.1 |   |
|  |                              |  |  Grid   [===]             0.8 |   |
|  |  Your battery is slowly      |  |                               |   |
|  |  charging from solar. Will   |  |                         (kW)  |   |
|  |  be full by 2 PM. Holding    |  |                               |   |
|  |  for afternoon peak.         |  |                               |   |
|  +------------------------------+  +-------------------------------+   |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Forecast (24h)                   [Today] [48h]     kW     c/kWh  |  |
|  |                                                                  |  |
|  |  kW                                                        80c   |  |
|  |  5 |  ....                                                       |  |
|  |    | /.   \.                                   ##           60c   |  |
|  |  4 |/solar \..                              ## ##                |  |
|  |    |         \.....            ......     ## ## ## ##        40c   |  |
|  |  3 |           house\___  ___/       \  ## ## ## ## ##            |  |
|  |    |      NOW          \/             ## ## ## ## ## ##      20c   |  |
|  |  2 |  ## [##] ##                   ## ## ## ## ## ## ## ##        |  |
|  |    |  ##  ##  ## ## ## ## ## ## ## ## ## ## ## ## ## ## ## ##  0c   |  |
|  |  0 +--+---+---+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+   |  |
|  |     6a  7a  8a 9a 10 11 12  1p 2p 3p 4p 5p 6p 7p 8p 9p 10 11   |  |
|  |     [....solar]  [--house--]  [##price bars##]                   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Schedule                                                         |  |
|  |                                                                  |  |
|  | Actions:  |==CHARGE==|====SOLAR/HOLD====|==DISCHARGE==|==CHG==|  |  |
|  | Profile:  |=====Conservative=====|======Aggressive======|=Bal==| |  |
|  |           6a        9a          2p  4p              9p    11p     |  |
|  |                   ^ now                                          |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +-----------+-----------+  +--------------------------------------+   |
|  | [sun]     | [batt]    |  | Today's Savings                     |   |
|  | Solar     | Battery   |  |                                     |   |
|  | 12.4 kWh  | 8.2 kWh   |  |    $2.40                            |   |
|  | Pk: 4.2kW | 0.8 cyc   |  |    vs $4.60 without battery         |   |
|  +-----------+-----------+  |                                     |   |
|  | [house]   | [grid]    |  |  Import costs:    -$1.20            |   |
|  | House     | Grid      |  |  Export earnings:  +$3.60            |   |
|  | 15.6 kWh  | Net -1.9  |  |  Net cost:         $1.20            |   |
|  | Avg 1.4kW | Exp 5.1   |  |                                     |   |
|  +-----------+-----------+  |  [Today] [Week] [Month]             |   |
|  (colored card backgrounds) |                                     |   |
|                              +--------------------------------------+  |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Battery Mode                                                     |  |
|  |  +------------+----------------+------------------+              |  |
|  |  | [*] Auto   | Force Charge   | Force Discharge  |              |  |
|  |  +------------+----------------+------------------+              |  |
|  |  Mode: Automatic  |  Next action: Discharge at 4:00 PM          |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+========================================================================+
```

---

## Web Dashboard -- Tablet (768px)

```
+================================================+
| [*] Battery Brain   [Balanced]  [Auto] [sun] [*]|
+================================================+
|                                                |
|  [87%] [32.4c] [$2.40] [4.2kW] [Balanced]     |
|                                                |
|  > Storing solar energy                        |
|    Solar exceeds demand. Topping up battery.   |
|                                                |
|  +--------------------+  +-------------------+ |
|  |    +---------+     |  | FROM              | |
|  |    |  ####   |     |  | Solar [======]4.2 | |
|  |    |  ####   | 87% |  | Grid  [=]    0.8 | |
|  |    |  ####   |     |  | TO                | |
|  |    +---------+     |  | House [====] 2.1 | |
|  |  [Charging +2.4kW] |  | Batt  [====] 2.1 | |
|  +--------------------+  +-------------------+ |
|                                                |
|  Charging from solar. Full by 2 PM. Holding    |
|  for afternoon peak at 65c/kWh.               |
|                                                |
|  +--------------------------------------------+|
|  | Forecast (24h)              kW       c/kWh ||
|  |  ...solar...    ## [##] ## ## ## ## ## ##   ||
|  |  --house--     NOW   10a    2p    6p  10p  ||
|  +--------------------------------------------+|
|                                                |
|  +--------------------------------------------+|
|  | Actions: |=CHG=|==HOLD==|=DCHG==|==CHG==| ||
|  | Profile: |=Consrv=|===Aggressive===|=Bal=| ||
|  +--------------------------------------------+|
|                                                |
|  +--------+--------+  +---------------------+ |
|  |Solar   |Battery |  | Savings: $2.40      | |
|  |12.4kWh |8.2 kWh |  | vs $4.60 w/o batt   | |
|  +--------+--------+  | Import: -$1.20      | |
|  |House   |Grid    |  | Export: +$3.60      | |
|  |15.6kWh |Net-1.9 |  | [Today][Week][Month]| |
|  +--------+--------+  +---------------------+ |
|                                                |
|  +--------------------------------------------+|
|  | Mode: [*Auto*] [Charge] [Discharge]        ||
|  +--------------------------------------------+|
+================================================+
```

---

## Mobile -- Dashboard Screen

```
+----------------------------------+
|  9:41              LTE  [100%]   |
+----------------------------------+
| Battery Brain          [sun] [*] |
+----------------------------------+
|                                  |
| [87%] [32.4c] [$2.40] [4.2kW]   |
| (stat pills, scrollable)        |
|                                  |
| +------------------------------+ |
| | > Storing solar energy       | |
| |   Solar exceeds demand.      | |
| +------------------------------+ |
|                                  |
|  +------------+ +-------------+  |
|  |  +------+  | | FROM        |  |
|  |  | #### |  | | Solar ==4.2 |  |
|  |  | #### |  | | Grid  = 0.8 |  |
|  |  | ####87% | | TO          |  |
|  |  +------+  | | House ==2.1 |  |
|  | [Chg+2.4kW]| | Batt  ==2.1 |  |
|  +------------+ +-------------+  |
|                                  |
| v Charging from solar. Full by   |
|   2 PM. Holding for afternoon    |
|   peak. (tap to collapse)        |
|                                  |
| +------------------------------+ |
| | Forecast     kW        c/kWh | |
| | ..solar.. ## [##] ## ## ## # | |
| | --house-- NOW  12p  6p  12a  | |
| +------------------------------+ |
|                                  |
| +------------------------------+ |
| | Actions: |CHG|=HOLD=|DCH|CHG| |
| | Profile: |Conserv|Aggrsv |Bal| |
| | 6a   9a   2p  4p   9p  11p  | |
| +------------------------------+ |
|                                  |
| +-------------++--------------+  |
| |[sun] Solar  ||[bat] Battery |  |
| | 12.4 kWh    || 8.2 kWh     |  |
| +-------------++--------------+  |
| |[hse] House  ||[grd] Grid   |  |
| | 15.6 kWh    || Net -1.9    |  |
| +-------------++--------------+  |
|                                  |
| +------------------------------+ |
| | Savings        $2.40         | |
| | vs $4.60 without battery     | |
| | Import -$1.20  Export +$3.60 | |
| | [Today] [Week] [Month]      | |
| +------------------------------+ |
|                                  |
|                           [FAB]  |
|                          (Auto)  |
+----------------------------------+
| [Dash] [Strategy] [Hist] [Sett] |
+----------------------------------+
```

The FAB (Floating Action Button) in the bottom-right shows the current
mode icon. Tapping opens a bottom sheet with Auto/Charge/Discharge
controls and duration picker. Always accessible from any scroll position.

---

## Mobile -- Home Screen Widget

```
+------------------------------------------+
|  Battery Brain                           |
|  [batt] 87%  |  32.4c  | Balanced | $2.40 |
|  [=======green bg for price signal====]  |
+------------------------------------------+
```

Compact single-row widget. Entire background tinted by price signal color at reduced opacity.

---

## Mobile -- Push Notification

### Price Spike
```
+------------------------------------------+
|  Battery Brain                    now     |
|  Price Spike: 85.2 c/kWh                |
|  Battery discharging at 3.1 kW.          |
|  Estimated savings: $0.45/hr             |
+------------------------------------------+
```

### Battery Full
```
+------------------------------------------+
|  Battery Brain                   2m ago   |
|  Battery Full (100%)                     |
|  Switching to export mode.               |
|  Feed-in rate: 8.5 c/kWh                |
+------------------------------------------+
```

---

## Web -- History Page

```
+========================================================================+
| [*] Battery Brain    [Balanced until 4p]     [Auto v] [sun/moon] [gear]|
+========================================================================+
|                                                                        |
|  [Dashboard]  [Strategy]  [History]  [Settings]                        |
|                                                                        |
|  Period: [Day] [Week] [*Month*] [Custom]         March 2026            |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Total Savings This Month                                         |  |
|  |                                                                  |  |
|  |      $67.42                                                      |  |
|  |      vs $12.30 without battery                                   |  |
|  |                                                                  |  |
|  |   ___                                                  ____      |  |
|  |  /   \____          ____                           ___/    \     |  |
|  | /         \________/    \________    _____________/          \   |  |
|  | Mar 1         Mar 8       Mar 15      Mar 22          Mar 25    |  |
|  |                                                                  |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +------------------+  +-------------------+  +-------------------+    |
|  | Solar Generated  |  | Grid Imported     |  | Grid Exported     |    |
|  |    342.5 kWh     |  |     89.2 kWh      |  |    156.8 kWh      |    |
|  |    +12% vs Feb   |  |    -8% vs Feb     |  |    +15% vs Feb    |    |
|  +------------------+  +-------------------+  +-------------------+    |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Self-Consumption Rate                                            |  |
|  |                                                                  |  |
|  |  [===================75%===================|     25%     ]       |  |
|  |   Self-consumed                              Exported            |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  | Daily Breakdown                                          [CSV]   |  |
|  |                                                                  |  |
|  | Date       Savings  Solar   Import  Export  Self-use  Cycles     |  |
|  | Mar 25     $2.40    12.4    3.2     5.1     78%       0.8        |  |
|  | Mar 24     $3.15    14.2    2.1     6.8     82%       1.1        |  |
|  | Mar 23     $1.80    8.6     5.4     2.1     65%       0.6        |  |
|  | ...                                                              |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+========================================================================+
```

---

## Web -- Strategy Page

```
+========================================================================+
| [*] Battery Brain    [Balanced until 4p]     [Auto v] [sun/moon] [gear]|
+========================================================================+
|                                                                        |
|  [Dashboard]  [Strategy]  [History]  [Settings]                        |
|                                                                        |
|  Aggressiveness Profile                                                |
|  +------------------------------------------------------------------+  |
|  |                                                                  |  |
|  |  Presets: [Conservative]  [*Balanced*]  [Aggressive]  [Custom]   |  |
|  |                                                                  |  |
|  |  Export        How eagerly to sell stored energy to the grid      |  |
|  |  Keep [1]----[2]----[*3*]----[4]----[5] Max                      |  |
|  |               Balanced: sell when price > 40c/kWh                |  |
|  |                                                                  |  |
|  |  Preservation  How much battery reserve to maintain              |  |
|  |  Max  [1]----[2]----[*3*]----[4]----[5] Full Use                 |  |
|  |               Balanced: keep 30% reserve (2.7 kWh)               |  |
|  |                                                                  |  |
|  |  Import        How eagerly to charge from the grid               |  |
|  |  Min  [1]----[2]----[*3*]----[4]----[5] Max                      |  |
|  |               Balanced: charge when price < 20c/kWh              |  |
|  |                                                                  |  |
|  |  +------------------------------------------------------------+  |  |
|  |  | With these settings:                                       |  |  |
|  |  |   Reserve: 30% (2.7 kWh backup for ~2h)                   |  |  |
|  |  |   Export:  When price > 40c/kWh                            |  |  |
|  |  |   Import:  When price < 20c/kWh                            |  |  |
|  |  |   Est. daily: $2.10 - $3.80 savings (based on last 7 days) |  |  |
|  |  +------------------------------------------------------------+  |  |
|  |                                                                  |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Schedule                                              [Week] [Month]  |
|  +------------------------------------------------------------------+  |
|  |        Mon    Tue    Wed    Thu    Fri    Sat    Sun               |  |
|  |                                                                  |  |
|  |  6am   [cons] [cons] [cons] [cons] [cons] [bal ] [bal ]          |  |
|  |  8am   [bal ] [bal ] [bal ] [bal ] [bal ] [bal ] [bal ]          |  |
|  | 10am   [bal ] [bal ] [bal ] [bal ] [bal ] [bal ] [bal ]          |  |
|  | 12pm   [bal ] [bal ] [bal ] [bal ] [bal ] [bal ] [bal ]          |  |
|  |  2pm   [bal ] [bal ] [bal ] [bal ] [bal ] [bal ] [bal ]          |  |
|  |  4pm   [aggr] [aggr] [aggr] [aggr] [aggr] [bal ] [bal ]          |  |
|  |  6pm   [aggr] [aggr] [aggr] [aggr] [aggr] [bal ] [bal ]          |  |
|  |  8pm   [aggr] [aggr] [aggr] [aggr] [aggr] [bal ] [bal ]          |  |
|  | 10pm   [cons] [cons] [cons] [cons] [cons] [cons] [cons]          |  |
|  | 12am   [cons] [cons] [cons] [cons] [cons] [cons] [cons]          |  |
|  |                        ^                                          |  |
|  |                      TODAY                                        |  |
|  |                                                                  |  |
|  |  Legend: [blue]=Conservative  [purple]=Balanced  [amber]=Aggr.   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Upcoming Changes                                                      |
|  +------------------------------------------------------------------+  |
|  |  4:00 PM  ->  Aggressive  (weekday evening rule)                 |  |
|  | 10:00 PM  ->  Conservative (nightly rule)                        |  |
|  |  6:00 AM  ->  Conservative (morning rule)                        |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+========================================================================+
```

---

## Web -- Strategy Page -- Add Rule Popover

Appears when clicking a time block on the calendar.

```
+--------------------------------------+
| Schedule Rule                    [x] |
+--------------------------------------+
|                                      |
| Profile:                             |
| [Conservative] [*Aggressive*] [Cust] |
|                                      |
| Time:                                |
| [4:00 PM] to [8:00 PM]              |
|                                      |
| Repeat:                              |
| [Every day] [*Weekdays*] [Weekends]  |
| [Custom...]                          |
|                                      |
| +----------------------------------+ |
| | Impact: During these hours, the  | |
| | system will maximize grid export | |
| | and use full battery capacity.   | |
| +----------------------------------+ |
|                                      |
|         [Delete]        [Save]       |
+--------------------------------------+
```

---

## Mobile -- Strategy Screen

```
+----------------------------------+
|  9:41              LTE  [100%]   |
+----------------------------------+
| Strategy                    [?]  |
+----------------------------------+
|                                  |
| Active: [purple] Balanced        |
|                                  |
| +------------------------------+ |
| |  [Conservative] [*Balanced*] | |
| |  [Aggressive]   [Custom]     | |
| +------------------------------+ |
|                                  |
| Export                           |
| Keep [1]--[2]--[*3*]--[4]--[5]  |
|            Balanced              |
|                                  |
| Preservation                     |
| Max  [1]--[2]--[*3*]--[4]--[5]  |
|            Balanced              |
|                                  |
| Import                           |
| Min  [1]--[2]--[*3*]--[4]--[5]  |
|            Balanced              |
|                                  |
| +------------------------------+ |
| | Reserve: 30% (2.7 kWh ~2h)  | |
| | Export > 40c  Import < 20c   | |
| | Est. $2.10-$3.80/day         | |
| +------------------------------+ |
|                                  |
| Schedule           [Week][Month] |
| +------------------------------+ |
| |  <-- Wed 25 Mar -->          | |
| |                              | |
| |  6am  [Conservative]        | |
| |  8am  [Balanced]            | |
| | 10am  [Balanced]            | |
| | 12pm  [Balanced]            | |
| |  2pm  [Balanced]            | |
| |  4pm  [Aggressive]          | |
| |  6pm  [Aggressive]          | |
| |  8pm  [Aggressive]          | |
| | 10pm  [Conservative]        | |
| | 12am  [Conservative]        | |
| |                              | |
| +------------------------------+ |
|  Swipe left/right for other days  |
|                                  |
| Next: Aggressive at 4:00 PM     |
|                                  |
+----------------------------------+
| [Dash] [Strategy] [Hist] [Sett] |
+----------------------------------+
```

---

## Mobile -- Add Rule Bottom Sheet

Slides up when tapping a time block on mobile calendar.

```
+----------------------------------+
|                                  |
| ---- (drag handle) ----         |
|                                  |
| Schedule Rule                    |
|                                  |
| Profile:                         |
| +--------+  +--------+          |
| | Consrv |  |*Aggrsv*|          |
| +--------+  +--------+          |
| +--------+  +--------+          |
| |Balanced|  | Custom |          |
| +--------+  +--------+          |
|                                  |
| Time:                            |
| [4:00 PM]  to  [8:00 PM]        |
|                                  |
| Repeat:                          |
| [Every day] [*Weekdays*]        |
| [Weekends]  [Custom...]         |
|                                  |
| +------------------------------+ |
| | Max export, full battery use | |
| | during peak price hours.     | |
| +------------------------------+ |
|                                  |
| [Delete]              [Save]    |
|                                  |
+----------------------------------+
```

---

## Web -- Dashboard -- Profile Quick-Edit Panel

Slides out from the right when clicking the Profile Badge in the nav bar.
Allows quick profile changes without navigating to the Strategy page.

```
                          +-------------------------------+
                          | Quick Profile            [x]  |
                          +-------------------------------+
                          |                               |
                          | [Consrv] [*Balanced*] [Aggr]  |
                          |                               |
                          | Export                        |
                          | [1]--[2]--[*3*]--[4]--[5]    |
                          |                               |
                          | Preservation                  |
                          | [1]--[2]--[*3*]--[4]--[5]    |
                          |                               |
                          | Import                        |
                          | [1]--[2]--[*3*]--[4]--[5]    |
                          |                               |
                          | +---------------------------+ |
                          | | Reserve: 30%              | |
                          | | Est. $2.10-$3.80/day      | |
                          | +---------------------------+ |
                          |                               |
                          | Changes apply immediately.    |
                          | For scheduling, go to         |
                          | [Strategy page ->]            |
                          |                               |
                          +-------------------------------+
```

---

## Web -- Settings Page

```
+========================================================================+
| [*] Battery Brain    [Balanced until 4p]     [Auto v] [sun/moon] [gear]|
+========================================================================+
|                                                                        |
|  [Dashboard]  [Strategy]  [History]  [Settings]                        |
|                                                                        |
|  Notifications                                                         |
|  +------------------------------------------------------------------+  |
|  | Price spike alert:     [ON]   above [ 60 ] c/kWh                 |  |
|  | Battery full alert:    [ON]                                      |  |
|  | Battery low alert:     [ON]   below [ 15 ] %                     |  |
|  | Daily summary:         [ON]   at [ 9:00 PM ]                     |  |
|  | Quiet hours:           [OFF]  [ 10 PM ] - [ 7 AM ]               |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  API Connections                                                       |
|  +------------------------------------------------------------------+  |
|  | FoxESS:         [Connected]  Last sync: 30s ago                  |  |
|  | Amber Electric: [Connected]  Last sync: 2m ago                   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Appearance                                                            |
|  +------------------------------------------------------------------+  |
|  | Theme: [Light] [Dark] [System]                                   |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Data                                                                  |
|  +------------------------------------------------------------------+  |
|  | [Export CSV]  [Clear History]                                     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+========================================================================+
```

---

## Mobile -- Mode Control FAB Bottom Sheet

Opened by tapping the Floating Action Button on any mobile screen.

```
+----------------------------------+
|                                  |
| ---- (drag handle) ----         |
|                                  |
| Battery Mode                     |
|                                  |
| +--------+--------+-----------+  |
| | [*]    |        |           |  |
| | Auto   | Charge | Discharge |  |
| +--------+--------+-----------+  |
|                                  |
| Duration (for manual override):  |
| [30 min] [1 hr] [2 hr] [Until]  |
|                                  |
| Currently: Auto                  |
| Next action: Discharge at 4 PM  |
|                                  |
|              [Apply]             |
|                                  |
+----------------------------------+
```

---

## Component Sizing Reference

| Component | Web Desktop | Web Tablet | Mobile |
|-----------|------------|------------|--------|
| Stat Pills | Full-width row, 40px h | Full-width row, 40px h | Full-width, scroll, 36px h |
| Status Header | Full-width, ~60px h | Full-width, ~50px h | Full-width, ~50px h |
| Battery Gauge | 180px | 140px | 120px |
| Power Flow Bars | Card (50%), ~180px h | Card (50%), ~150px h | Card (50%), ~130px h |
| Decision Explanation | Within gauge card, ~60px h | Full-width, ~50px h | Collapsible, ~50px h |
| Forecast Chart (dual) | Full-width, 320px h | Full-width, 240px h | Full-width, 160px h |
| Schedule Timeline | Full-width, 100px h (2 rows) | Full-width, 80px h | Full-width, 70px h |
| Energy Metric Cards | 2x2 grid, Card (50%) | 2x2 grid, Card (50%) | 2x2 grid, full-width |
| Savings Card | Card (50%), ~200px h | Card (50%), ~180px h | Full-width card |
| Mode Control | Full-width card, 56px h | Full-width, 56px h | FAB 56px + bottom sheet |
| Profile Badge | Nav bar, ~160px | Nav bar, ~140px | Stat pills inline |
| Aggressiveness Sliders | Card, ~600px w | Full-width | Full-width |
| Calendar Week View | Full-width, ~500px h | Full-width, ~400px h | Full-width, scroll |
| Quick-Edit Panel | 320px slide-out | 320px slide-out | Bottom sheet |
