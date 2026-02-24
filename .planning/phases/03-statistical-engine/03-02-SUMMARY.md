---
phase: 03-statistical-engine
plan: 02
subsystem: api
tags: [python, fastapi, pydantic, prophet, uvicorn, docker, uv]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: campaign_metrics data that the analysis engine will consume for statistical modeling
provides:
  - FastAPI analysis service scaffold with health check at GET /health and GET /health/dependencies
  - Pydantic v2 request/response schemas for all four statistical endpoints (forecast, incrementality, saturation, anomalies)
  - Retail event calendar (12 US events) with Prophet-compatible output format
  - Production Dockerfile for the Python sidecar service
  - uv-managed Python 3.11 package with all statistical dependencies declared
affects:
  - 03-statistical-engine (Plans 03-05 implement against these schema contracts)
  - 04-dashboard (TypeScript orchestration calls these typed endpoints)

# Tech tracking
tech-stack:
  added:
    - fastapi>=0.115.0 (HTTP framework for Python statistical service)
    - uvicorn[standard] (ASGI server for production)
    - prophet>=1.1.0 (Meta's time-series forecasting with seasonality)
    - causalpy>=0.7.0 (Bayesian Interrupted Time Series for incrementality)
    - pymc-marketing>=0.18.0 (probabilistic marketing mix modeling)
    - statsmodels>=0.14.0 (classical statistical methods)
    - ruptures>=1.1.0 (change-point detection)
    - arviz>=0.19.0 (Bayesian model diagnostics)
    - pydantic>=2.0 (typed request/response validation)
    - pandas>=2.0 (data manipulation)
    - numpy, scipy (numerical computing)
    - uv (Python dependency manager, lock file generation)
  patterns:
    - uv-managed Python package in packages/analysis with pyproject.toml and uv.lock
    - FastAPI app with lifespan context manager for startup events
    - CORS middleware allowing all origins for Next.js dev integration
    - importlib-based dependency health check (checks all statistical libs are importable)
    - Algorithmic retail event calendar (Easter, nth-weekday, last-weekday helpers)
    - Prophet-compatible holiday DataFrame format (holiday, ds, lower_window, upper_window)

key-files:
  created:
    - packages/analysis/pyproject.toml
    - packages/analysis/.python-version
    - packages/analysis/uv.lock
    - packages/analysis/main.py
    - packages/analysis/Dockerfile
    - packages/analysis/routers/__init__.py
    - packages/analysis/routers/health.py
    - packages/analysis/models/__init__.py
    - packages/analysis/schemas/__init__.py
    - packages/analysis/schemas/requests.py
    - packages/analysis/schemas/responses.py
    - packages/analysis/data/__init__.py
    - packages/analysis/data/retail_calendar.py
  modified: []

key-decisions:
  - "uv used as Python package manager — generates uv.lock for reproducible installs, .python-version pins to 3.11 (PyMC ecosystem stability)"
  - "Python 3.11 pinned — PyMC/Stan C extensions most stable on 3.11 vs 3.12+"
  - "Dockerfile installs uv via pip to resolve pyproject.toml dependencies — falls back to individual pip installs if uv resolution fails"
  - "IncrementalityResponse dual output (adjusted + raw) hardcoded at schema level per CONTEXT.md decision"
  - "get_retail_events uses algorithmic date computation (not hardcoded dates) — Easter uses Gregorian algorithm, nth/last-weekday helpers for floating holidays"
  - "Prime Day anchored to Jul 12 as estimate — users can override with exact date via user_events in ForecastRequest"
  - "SaturationResponse.saturation_percent is Optional[float] — None when fitting failed, status field distinguishes estimated/insufficient_variation/error"

patterns-established:
  - "Shared MetricRow type used across all four request models — single source of truth for daily campaign data shape"
  - "HolidayEvent mirrors Prophet holiday dict format — user events can be merged with retail calendar before Prophet fitting"
  - "Response models include diagnostics: dict field on IncrementalityScore — R-hat and ESS for Bayesian model quality"
  - "GET /health/dependencies uses importlib.import_module for lazy library checks — endpoint works even when heavy deps not imported at startup"

requirements-completed: [STAT-01, SEAS-01]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 3 Plan 02: Analysis Package Scaffold Summary

**FastAPI sidecar scaffolded with Pydantic schemas for all four statistical endpoints, 12-event retail calendar in Prophet-compatible format, and production Dockerfile — Plans 03-05 now have typed contracts to implement against**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T08:33:00Z
- **Completed:** 2026-02-24T08:38:00Z
- **Tasks:** 2
- **Files modified:** 13 created, 0 modified

## Accomplishments

- Created `packages/analysis` as a uv-managed Python 3.11 project with all statistical dependencies declared in pyproject.toml and locked in uv.lock
- FastAPI app running with health check (GET /health returns status/version, GET /health/dependencies checks all 11 statistical libraries via importlib) and lifespan startup logging
- Pydantic v2 schemas for all four endpoints (ForecastRequest/Response, IncrementalityRequest/Response, SaturationRequest/Response, AnomalyRequest/Response) verified with live data
- Retail calendar generating 12 events per year (2024-2026 = 36 events) in Prophet-compatible DataFrame format — algorithmic date computation handles floating holidays (Easter, Mother's Day, Labor Day etc.)
- Production Dockerfile with system deps for C extensions, uv install, and curl-based HEALTHCHECK

## Task Commits

Each task was committed atomically:

1. **Task 1: Create packages/analysis Python package with FastAPI and dependencies** - `6c98f1e` (feat)
2. **Task 2: Define Pydantic schemas and retail event calendar data** - `81cd1a0` (feat)

## Files Created/Modified

- `packages/analysis/pyproject.toml` — Project definition with all statistical deps (prophet, causalpy, pymc-marketing, statsmodels, ruptures, arviz, fastapi, uvicorn, pydantic, pandas, numpy, scipy)
- `packages/analysis/.python-version` — Pins Python 3.11
- `packages/analysis/uv.lock` — Lock file for reproducible installs (103 packages resolved)
- `packages/analysis/main.py` — FastAPI app with CORS middleware, health router, placeholder comments for Plans 03-05 routers
- `packages/analysis/Dockerfile` — Multi-stage build with gcc/g++ for C extensions, uv install, healthcheck
- `packages/analysis/routers/health.py` — GET /health and GET /health/dependencies with importlib version checks for all 11 libs
- `packages/analysis/models/__init__.py` — Empty init for statistical model implementations (Plans 03-05)
- `packages/analysis/schemas/requests.py` — ForecastRequest, IncrementalityRequest, SaturationRequest, AnomalyRequest + shared MetricRow/HolidayEvent
- `packages/analysis/schemas/responses.py` — ForecastResponse, IncrementalityResponse (adjusted+raw), SaturationResponse, AnomalyResponse + sub-models
- `packages/analysis/data/retail_calendar.py` — 12 US retail events, get_retail_events(start_year, end_year), to_prophet_holidays(events) -> pd.DataFrame

## Decisions Made

- uv selected as package manager (not pip/poetry) — generates uv.lock for reproducible builds, aligns with modern Python tooling
- Python 3.11 pinned — PyMC/Stan C extensions are most stable on 3.11; Python 3.14 host machine uses separate venv
- IncrementalityResponse dual output (adjusted/raw) hardcoded at schema layer per CONTEXT.md decision — schema enforces the product decision
- Prime Day anchored to Jul 12 as algorithmic estimate — ForecastRequest.user_events allows override with actual announced date
- SaturationResponse.saturation_percent Optional[float] with status field — None when fitting fails, status distinguishes insufficient_variation vs error

## Deviations from Plan

None - plan executed exactly as written. uv was installed via `python -m pip install uv` as planned fallback.

## Issues Encountered

- uv not in system PATH initially — installed via `python -m pip install uv` as specified in plan's fallback. `python -m uv` worked after installation.
- uv.lock generation required a minimal venv first since pyproject.toml references Python 3.11 but system Python is 3.14 — created .venv with Python 3.11 for local verification.

## User Setup Required

None — the analysis package is scaffolded but not deployed. Full production setup requires:
1. Docker build: `docker build -t iiq-analysis packages/analysis/`
2. Heavy dependencies (prophet, pymc-marketing) require significant download time (~500MB) on first Docker build
3. uv sync for local dev: `cd packages/analysis && python -m uv sync`

## Next Phase Readiness

- Plans 03-05 can now import from `schemas.requests` and `schemas.responses` for typed endpoint implementation
- The retail calendar is ready for use in any Prophet model fitting — just call `get_retail_events(start_year, end_year)` and `to_prophet_holidays(events)`
- Health check infrastructure means the service can be deployed and monitored before statistical endpoints are implemented
- No blockers for Plans 03-05

## Self-Check: PASSED

All created files verified present on disk. Both task commits (6c98f1e, 81cd1a0) confirmed in git history.

---
*Phase: 03-statistical-engine*
*Completed: 2026-02-24*
