# Phase 4: Recommendations and Dashboard - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert statistical engine outputs (incrementality scores, confidence intervals, saturation curves, seasonal data) into scaling-first recommendations and a multi-audience dashboard. Five pages: Executive Overview, Marketing Performance, Statistical Insights, Seasonality Planning, Data Health. Users can export data and the UI is mobile-responsive. Product Overview and Customer Segmentation are deferred to future phases.

</domain>

<decisions>
## Implementation Decisions

### Recommendation Framing
- Scale-up recommendations use **specific numbers**: "Increase Campaign X budget by 25% ($500/day → $625/day) for 3 weeks — expected +$12K incremental revenue"
- Multiple recommendations **ranked by expected impact** — highest incremental revenue at top, confidence indicator per recommendation
- When confidence is low: **primary path is "wait for more data"** with countdown to next analysis date; **secondary path offers holdout test** as an accelerator option ("can't wait? run a 2-week holdout test on 10% of spend")
- Holdout tests are never the first option — only offered when statistical modeling lacks sufficient confidence, and only as an alternative to waiting

### Seasonal Pre-alerts
- **Proactive cards** in a dedicated "Upcoming" section at top of dashboard
- Format: "BFCM in 6 weeks: Campaign X scaled +40% last year, consider ramping now"
- Seasonality Planning page (see Navigation below) expands on this with calendar timeline and historical comparison

### Navigation and Page Structure
- **Collapsible sidebar** navigation — emphasis on smooth, natural animation and reliable open/close behavior (non-buggy)
- Five main pages:
  1. **Executive Overview** — Business owner view
  2. **Marketing Performance** — Marketer view
  3. **Statistical Insights** — Analyst view
  4. **Seasonality Planning** — Forward-looking seasonal prep
  5. **Data Health** — Sync status, missing data, advanced settings
- **Shared state** across pages — same date range and filters apply everywhere; switching pages shows the same data slice
- Integration freshness indicators in sidebar (quick status) + full detail on Data Health page

### Executive Overview Page
- **KPI-first** layout — 4 equal-sized customizable KPI cards at top
- KPI cards are **draggable/reorderable** and **swappable** — user picks which 4 metrics to show
- User's KPI selection and ordering **persisted across sessions**
- **One hero chart** below KPIs (e.g., incremental revenue over time)
- Further down: **smaller supporting charts** — platform growth comparison, recent test results, expected seasonality trends with year progress indicator
- Recommendations section below charts

### Marketing Performance Page
- **Priority queue at top** — urgent campaign actions ranked: scale, watch, investigate
- **Platform tabs below** (Meta, Google, All) — each tab shows that platform's performance, cross-platform insights, and opportunities
- Practical, action-oriented — less stats, more "here's what to do"

### Statistical Insights Page
- **Model health and trends overview** at top — model accuracy over time, forecast vs actual overlays, confidence trend lines
- **Expandable deep-dive sections** for each metric — raw statistical outputs, hypothesis testing results, detailed confidence intervals, methodology comparisons, data quality metrics
- **Long-range progression view** — last 12 months performance progression, experiment history, model improvement over time
- **Methodology sidebar** — persistent collapsible panel showing full model details (ITS model type, window size, Prophet baseline parameters)
- Expandable table rows with **preset and custom filters** for campaign → cluster → channel drill-down

### Seasonality Planning Page
- **Calendar timeline** (forward-looking) — visual timeline showing upcoming retail events with budget recommendations per campaign: "BFCM: ramp Campaign X 3 weeks before, peak spend during, taper after"
- **Historical comparison section** — last year's performance during each seasonal period with this year's forecast: "Last BFCM you spent $X and got Y incremental revenue, this year we project Z"

### Data Health Page
- Previous sync history and status per integration
- Missing data gaps over time
- Advanced integration settings
- Direct links to reconnect/fix broken integrations

### Date Range and Comparison
- Default view: **last 30 days**
- Preset options: 7, 14, 30, 90 days + custom range
- **Toggle-based comparison mode** — activates second date range picker, KPIs show deltas (e.g., "+12% vs previous period"), charts overlay both periods

### Visual Design Direction
- **Page density gradient** — clean analytical at top of each page (lots of whitespace, key information), transitioning to richer data visualization toward the bottom as information density increases
- **Dark and light mode** with toggle, persisted per user. Light mode default.
- **Brand-forward palette** — Incremental IQ default brand colors (to be provided), with option for each tenant to use their own brand colors
- During onboarding: prompt "Default Colours" or "Use My Brand's Colours" — if custom, system reviews their website and auto-extracts identifiable brand colors, which user can adjust
- **Chart styling**: Gradient fills — area charts with gradient fills fading to transparent, smooth line charts, rounded bar charts
- **Typography**: Inter Bold for headings (42px titles), Manrope for body text
- **Animations**: 400ms transitions — smooth and seamless, never feels like waiting for an animation. Rich motion that moves fluidly.
- **Table density**: Comfortable spacing throughout — generous row height, clear visual separation, hover highlights

### Empty and Loading States
- **First-time experience**: Progress dashboard showing setup status ("Data syncing 72%... First analysis ready in ~24 hours"). Dashboard structure visible with placeholder states.
- **Famous business/marketing quotes** on loading sections to fill empty space and maintain positive momentum (e.g., "If you can't measure it, you can't improve it." — Peter Drucker)
- **Page loading**: Skeleton loaders + progressive loading — skeletons shown immediately, KPIs resolve first, charts second, tables last
- **Empty sections**: Contextual empty states with specific messaging per section ("No holdout tests yet — system will suggest one when confidence is low", "Seasonal planning activates 6 weeks before your first retail event")
- **Stale data**: Inline warning banners showing last-known-good data with fix-it link ("Meta Ads data is 3 days stale — reconnect"). Never hide the dashboard.

### Notifications and Alerts
- **In-app notifications** (notification bell with unread badge) for all four types:
  - Anomaly detected (unusual spend spike, revenue drop, performance deviation)
  - New recommendation ready (new scaling recommendation or confidence update)
  - Seasonal alert (upcoming retail events with prep timeline)
  - Data health issues (sync failures, stale data, token expirations)
- **Email notifications** for data health issues and seasonal deadlines only
- Notification format: **brief message with link** to the relevant page/section
- **Simple toggles** in settings — per notification type, per channel (in-app vs email)

### Export
- CSV and Excel export for all visible data (details left to Claude's discretion)

### Mobile Responsiveness
- Full dashboard usable on mobile browsers (details left to Claude's discretion)

### Claude's Discretion
- Export UX details (CSV vs Excel defaults, what's exportable, button placement)
- Mobile responsive layout breakpoints and adaptations
- Exact KPI metric options available for customization
- Specific quote collection for loading states
- Notification bell interaction design
- Email template design
- Collapsible sidebar breakpoint behavior on mobile

</decisions>

<specifics>
## Specific Ideas

- "Clean analytical at the top, rich data viz toward the bottom" — information density increases with page scroll depth
- Collapsible sidebar must feel natural and non-buggy when opening — smooth animation is critical
- Business quotes on loading/empty states: "The best marketing doesn't feel like marketing." — Tom Fishburne, "If you can't measure it, you can't improve it." — Peter Drucker, "The aim of marketing is to know and understand the customer so well the product or service fits him and sells itself." — Peter Drucker
- Brand color auto-extraction: during onboarding, offer to scan the user's website and auto-populate their brand colors, which they can then adjust
- KPI cards should be equal size, draggable to reorder, and swappable — user's choices persist across sessions
- Marketing Performance page: priority queue for urgent actions at top, platform tabs (Meta, Google, All) below
- Statistical Insights: methodology sidebar (persistent/collapsible), 12-month progression view, experiment history
- Brand fonts: Inter Bold for headings (42px titles), Manrope for body text

</specifics>

<deferred>
## Deferred Ideas

- **Product Overview page** — Product-type breakdown for ecommerce, highlighting products with noticeable growth. Requires product-level analysis beyond current campaign-level statistical engine. Future phase.
- **Customer Segmentation page** — New vs Returning customers, LTV insights, campaign incrementality by customer type. Requires customer-level cohort data not in current ingestion pipeline. LTV prediction explicitly out of scope for v1 (separate modeling problem). Future phase.

</deferred>

---

*Phase: 04-recommendations-and-dashboard*
*Context gathered: 2026-02-24*
