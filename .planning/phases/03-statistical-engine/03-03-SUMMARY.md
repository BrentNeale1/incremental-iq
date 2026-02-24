---
phase: 03-statistical-engine
plan: 03
subsystem: api
tags: [prophet, forecasting, fastapi, pandas, retail-calendar, confidence-intervals]

# Dependency graph
requires:
  - phase: 03-statistical-engine
    plan: 02
    provides: FastAPI analysis sidecar with Pydantic schemas, retail calendar, Dockerfile

provides:
  - Prophet baseline forecasting model (fit_baseline) with retail event holiday injection and zero-spend filtering
  - POST /forecast endpoint returning ForecastResponse with confidence intervals and decomposed components
  - TDD test suite for forecast model and endpoint (6 tests)

affects: [03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: [prophet==1.3.0, pytest==9.0.2, httpx==0.28.1]
  patterns:
    - TDD RED→GREEN cycle with per-phase commits
    - Prophet multiplicative seasonality mode for trending revenue data
    - Holiday calendar injected at model construction time (not post-hoc)
    - Router mounted with prefix; handler route is "/" not "/endpoint-name"

key-files:
  created:
    - packages/analysis/models/baseline.py
    - packages/analysis/routers/forecast.py
    - packages/analysis/tests/__init__.py
    - packages/analysis/tests/test_forecast.py
  modified:
    - packages/analysis/main.py
    - packages/analysis/data/retail_calendar.py

key-decisions:
  - "Prophet lower_window convention: retail_calendar stores positive integers (human-readable 'days before'); to_prophet_holidays negates them to satisfy Prophet's required signed convention (lower_window <= 0)"
  - "Router POST handler path is '/' not '/forecast' — router is mounted with prefix='/forecast' in main.py making full path /forecast/"
  - "Zero-spend filtering only applies when zero-spend rows exceed 20% threshold — legitimate zero-spend weekend campaigns are preserved below threshold"
  - "fit_baseline raises ValueError for < 30 data points; forecast router converts this to 400 Bad Request"
  - "multiplicative seasonality_mode chosen over additive — revenue scales proportionally with trend (per RESEARCH.md recommendation)"

patterns-established:
  - "Router pattern: APIRouter() with empty '/' path, prefix set in main.py include_router call"
  - "fit_baseline() returns raw dicts; router maps to Pydantic response models"
  - "Prophet suppress logging: set cmdstanpy and prophet loggers to WARNING inside fit function"

requirements-completed: [STAT-01, STAT-03, STAT-07, SEAS-01]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 3 Plan 03: Baseline Forecasting Summary

**Prophet baseline model with retail calendar holidays, zero-spend filtering, and /forecast endpoint returning 90-day forecast with confidence intervals and decomposed seasonal components**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T08:49:40Z
- **Completed:** 2026-02-24T08:53:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 6

## Accomplishments

- `fit_baseline()` — Prophet wrapper that filters zero-spend days (>20% threshold), loads retail calendar events (12 event types × year range), merges user brand events, fits with multiplicative seasonality, returns forecast + components + model_params
- `POST /forecast` FastAPI endpoint — accepts ForecastRequest with 180+ days of campaign metrics, calls fit_baseline, maps to ForecastResponse with ForecastPoint list (yhat/yhat_lower/yhat_upper) and SeasonalComponent list (trend/yearly/weekly/holidays)
- 6 tests all passing: direct model tests (returns forecast, confidence intervals, holiday incorporation, zero-spend resilience) + endpoint integration tests (200 on valid data, 400/422 on 10-day insufficient dataset)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Write failing tests for baseline forecasting** - `b093da9` (test)
2. **Task 2: GREEN + REFACTOR — Implement Prophet baseline model and /forecast endpoint** - `f2392eb` (feat)

**Plan metadata:** _(see final commit below)_

_Note: TDD tasks — test commit RED, then implementation commit GREEN_

## Files Created/Modified

- `packages/analysis/models/baseline.py` — fit_baseline() with holiday injection, zero-spend filtering, MIN_DATA_POINTS=30 enforcement
- `packages/analysis/routers/forecast.py` — POST / handler, error mapping (ValueError→400, Exception→500), Pydantic response construction
- `packages/analysis/tests/__init__.py` — test package init (empty)
- `packages/analysis/tests/test_forecast.py` — 6 tests with make_synthetic_revenue() helper
- `packages/analysis/main.py` — added `from routers import forecast`, registered `app.include_router(forecast.router, prefix="/forecast")`
- `packages/analysis/data/retail_calendar.py` — bug fix: negate lower_window in to_prophet_holidays() to satisfy Prophet's signed convention

## Decisions Made

- **Prophet lower_window sign convention:** retail_calendar stores lower_window as positive integers for human readability (e.g., `lower_window: 3` = "3 days before"). Prophet requires `lower_window <= 0`. Fixed in `to_prophet_holidays()` by negating the values (`-df["lower_window"].abs()`). This keeps the event definition intuitive while satisfying the library constraint.
- **Router path "/" vs "/forecast":** Router registered with `prefix="/forecast"` in main.py; handler decorated with `"/"` yields full path `/forecast/`. Using `"/forecast"` in the handler would yield `/forecast/forecast` (404).
- **Zero-spend threshold at 20%:** Campaigns with ≤20% zero-spend rows (common for weekend pause patterns) keep those rows — filtering them would introduce artificial gaps. Above 20%, the zero-spend days are likely data quality issues that would corrupt Prophet's weekly seasonality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prophet lower_window sign convention mismatch**
- **Found during:** Task 2 (Prophet model construction)
- **Issue:** Prophet 1.3.0 raises `ValueError: Holiday lower_window should be <= 0` — requires negative integers. retail_calendar.py stored them as positive integers (e.g., `lower_window: 3` for Black Friday). to_prophet_holidays() was passing them through unchanged.
- **Fix:** Added `df["lower_window"] = -df["lower_window"].abs()` in to_prophet_holidays() to negate the stored values before passing to Prophet.
- **Files modified:** packages/analysis/data/retail_calendar.py
- **Verification:** All 6 tests pass after fix; fit_baseline no longer raises ValueError on Prophet construction
- **Committed in:** f2392eb (Task 2 commit)

**2. [Rule 1 - Bug] Router path yielded /forecast/forecast (404)**
- **Found during:** Task 2 (endpoint integration tests)
- **Issue:** Router handler decorated with `@router.post("/forecast")` + router mounted with `prefix="/forecast"` = full path `/forecast/forecast`. Tests POSTing to `/forecast` received 404.
- **Fix:** Changed handler decorator from `@router.post("/forecast")` to `@router.post("/")`.
- **Files modified:** packages/analysis/routers/forecast.py
- **Verification:** test_forecast_endpoint_returns_200 and test_forecast_endpoint_rejects_insufficient_data both pass
- **Committed in:** f2392eb (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes necessary for correct operation. No scope changes.

## Issues Encountered

- Prophet not installed in the analysis venv (only FastAPI/pandas/numpy/pydantic were installed in Plan 02). Installed prophet==1.3.0, pytest==8.9.2→9.0.2, httpx==0.28.1 via `uv pip install` using the uv binary found at `/c/Users/brent/AppData/Local/Python/pythoncore-3.14-64/Scripts/uv.exe`. These were listed in pyproject.toml dev dependencies but hadn't been synced yet.

## Next Phase Readiness

- Plan 04 (incrementality scoring) can import fit_baseline() for counterfactual baseline construction
- /forecast endpoint is live at POST /forecast (prefix registered in main.py)
- Retail calendar holiday injection pattern is established and tested
- Zero-spend filtering logic ready to reuse in other models

---
*Phase: 03-statistical-engine*
*Completed: 2026-02-24*
