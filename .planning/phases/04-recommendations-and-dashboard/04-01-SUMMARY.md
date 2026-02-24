---
phase: 04-recommendations-and-dashboard
plan: "01"
subsystem: ui
tags: [shadcn, tailwind, zustand, tanstack-query, next-themes, drizzle, postgresql, rls]

# Dependency graph
requires:
  - phase: 03-statistical-engine
    provides: DB schema patterns (RLS policy pattern, migration file format, appRole)

provides:
  - shadcn/ui component library (23 components) with Tailwind v4 CSS-based config
  - Inter + Manrope fonts via next/font/google with --font-inter / --font-manrope CSS variables
  - Brand colors (#1e3a5f primary, #0ea5e9 accent) in globals.css @theme block
  - ThemeProvider (next-themes) with dark/light mode, no hydration flash
  - QueryProvider (TanStack Query v5) with SSR-safe QueryClient singleton
  - useDashboardStore (Zustand) with dateRange/viewMode/kpiOrder, persist + skipHydration
  - useNotificationStore (Zustand) with unreadCount
  - notifications DB table with RLS (tenant-scoped, type/message/linkPath/read)
  - user_preferences DB table with RLS (kpiOrder, viewMode, darkMode, brandColors)
  - Migration 0004_phase4_dashboard.sql with ENABLE/FORCE ROW LEVEL SECURITY

affects:
  - 04-02 (recommendation engine — imports ThemeProvider, QueryProvider patterns)
  - 04-03 (dashboard KPI cards — uses useDashboardStore)
  - 04-04 (charts — uses Recharts + shadcn chart component)
  - 04-05 (notifications — uses notifications DB table and useNotificationStore)
  - 04-06 (dashboard pages — uses all providers and stores)

# Tech tracking
tech-stack:
  added:
    - shadcn/ui (new-york style, Tailwind v4 CSS-based)
    - tailwindcss v4 + @tailwindcss/postcss + postcss
    - tw-animate-css
    - zustand v5 with persist middleware
    - "@tanstack/react-query v5 + devtools"
    - next-themes v0.4
    - "@dnd-kit/core + sortable + utilities"
    - xlsx + file-saver
    - resend + react-email + @react-email/components
    - clsx + tailwind-merge + class-variance-authority + radix-ui
    - lucide-react
    - react-day-picker (pulled in by shadcn calendar)
    - recharts 2.15.4 (pulled in by shadcn chart)
    - sonner (toast notifications)
  patterns:
    - Tailwind v4 @theme inline block for semantic color + font variable mapping
    - SSR-safe QueryClient singleton (new instance per server request, cached in browser)
    - Zustand persist with partialize + skipHydration for Next.js App Router compatibility
    - next-themes attribute="class" applied to <html> element with suppressHydrationWarning
    - DB migration: manually authored SQL following drizzle-kit output format exactly

key-files:
  created:
    - apps/web/app/globals.css
    - apps/web/components.json
    - apps/web/postcss.config.mjs
    - apps/web/lib/utils.ts
    - apps/web/components/layout/ThemeProvider.tsx
    - apps/web/components/layout/QueryProvider.tsx
    - apps/web/lib/query/client.ts
    - apps/web/lib/store/dashboard.ts
    - apps/web/lib/store/notifications.ts
    - packages/db/src/schema/notifications.ts
    - packages/db/src/schema/user-preferences.ts
    - packages/db/migrations/0004_phase4_dashboard.sql
    - apps/web/components/ui/ (23 shadcn UI components)
    - apps/web/hooks/use-mobile.ts
  modified:
    - apps/web/package.json (added all new deps + pnpm react-is override)
    - apps/web/app/layout.tsx (added Inter/Manrope fonts, ThemeProvider, QueryProvider)
    - packages/db/src/schema/index.ts (added notifications + user-preferences exports)
    - packages/db/migrations/meta/_journal.json (added 0004 entry)
    - pnpm-lock.yaml

key-decisions:
  - "Tailwind v4 uses @import + @theme block (no tailwind.config.js) — shadcn init requires Tailwind pre-installed before running init"
  - "shadcn init run non-interactively by piping stdin newline — dependency install step fails on Windows (pnpm not on PATH in child process), installed manually after"
  - "skipHydration: true on Zustand persist — required for Next.js App Router to avoid SSR hydration mismatch; client must call rehydrate() after mount"
  - "SSR-safe QueryClient pattern: typeof window === undefined check creates per-request instance on server, reuses cached instance in browser"
  - "notifications and user-preferences schemas already existed as untracked files from prior planning; committed them in Task 2 with migration"
  - "index.ts Phase 4 exports were already present as uncommitted changes — confirmed correct and committed as part of Task 2"

patterns-established:
  - "Tailwind v4 CSS-first config: @theme inline block maps shadcn CSS variables to Tailwind color utilities"
  - "Provider nesting order: ThemeProvider > QueryProvider > children (theme outer, data inner)"
  - "Zustand skipHydration pattern: persist only serializable primitives, never Date objects"
  - "DB schema + migration created together: schema file + manually authored SQL migration follows drizzle-kit output format"

requirements-completed: [RPRT-02, RPRT-07]

# Metrics
duration: 10min
completed: 2026-02-24
---

# Phase 04 Plan 01: UI Framework Foundation Summary

**shadcn/ui with Tailwind v4, next-themes dark mode, Zustand dashboard store with SSR-safe persist, TanStack Query provider, and notifications/user_preferences DB schema with RLS**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-24T13:19:58Z
- **Completed:** 2026-02-24T13:29:58Z
- **Tasks:** 2
- **Files modified:** 37 (23 shadcn UI components + 14 core files)

## Accomplishments

- Installed and configured shadcn/ui with Tailwind v4 CSS-based config (no tailwind.config.js), 23 UI components, brand color palette, and Inter/Manrope fonts
- Created ThemeProvider (next-themes) and QueryProvider (TanStack Query v5) wired into root layout with proper nesting order
- Created useDashboardStore (Zustand v5) with SSR-safe skipHydration persist for viewMode and kpiOrder
- Created notifications and user_preferences DB tables with RLS policies and migration 0004

## Task Commits

Each task was committed atomically:

1. **Task 1: Install UI libraries and configure shadcn/ui + Tailwind v4 + fonts** - `bdf0ab7` (feat)
2. **Task 2: Create providers, Zustand stores, and DB schema additions** - `d1d4222` (feat)

## Files Created/Modified

- `apps/web/app/globals.css` - Tailwind v4 @import, @theme block with font vars, brand colors, chart vars, dark mode
- `apps/web/components.json` - shadcn config (new-york style, neutral base, Tailwind v4)
- `apps/web/postcss.config.mjs` - @tailwindcss/postcss plugin
- `apps/web/lib/utils.ts` - cn() helper using clsx + tailwind-merge
- `apps/web/components/layout/ThemeProvider.tsx` - next-themes wrapper (attribute=class, defaultTheme=light)
- `apps/web/components/layout/QueryProvider.tsx` - TanStack QueryClientProvider with devtools
- `apps/web/lib/query/client.ts` - SSR-safe QueryClient singleton (60s staleTime)
- `apps/web/lib/store/dashboard.ts` - useDashboardStore with dateRange, viewMode, kpiOrder, skipHydration
- `apps/web/lib/store/notifications.ts` - useNotificationStore with unreadCount
- `apps/web/app/layout.tsx` - Inter + Manrope fonts, suppressHydrationWarning, providers wired
- `packages/db/src/schema/notifications.ts` - notifications table (type, message, linkPath, read) with RLS
- `packages/db/src/schema/user-preferences.ts` - user_preferences table (kpiOrder, viewMode, darkMode) with RLS
- `packages/db/src/schema/index.ts` - Phase 4 exports added
- `packages/db/migrations/0004_phase4_dashboard.sql` - CREATE TABLE + ENABLE/FORCE RLS + index + policies
- `apps/web/components/ui/` - 23 shadcn UI components (button, card, sidebar, chart, sonner, etc.)
- `apps/web/package.json` - all new deps + pnpm react-is override

## Decisions Made

- shadcn init run non-interactively required manual dep install after (pnpm not on PATH in shadcn's child process on Windows) — installed clsx, tailwind-merge, class-variance-authority, lucide-react, radix-ui separately
- Tailwind v4 uses CSS-based config (`@import "tailwindcss"` + postcss.config.mjs) — no tailwind.config.js needed or generated
- `skipHydration: true` on Zustand persist middleware is critical for Next.js App Router — prevents SSR/client mismatch when rehydrating localStorage state
- SSR-safe QueryClient singleton uses `typeof window === 'undefined'` guard — server always gets a fresh instance, browser reuses cached instance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn init dependency install failed on Windows**
- **Found during:** Task 1 (shadcn/ui initialization)
- **Issue:** shadcn's automatic `pnpm add clsx tailwind-merge...` step failed because pnpm was not on PATH in its child process (Windows PATH issue)
- **Fix:** Ran init to create components.json and globals.css, then manually installed all required packages via `pnpm add` from monorepo root
- **Files modified:** apps/web/package.json
- **Committed in:** bdf0ab7 (Task 1 commit)

**2. [Rule 3 - Blocking] Tailwind not found before shadcn init**
- **Found during:** Task 1 (first shadcn init attempt)
- **Issue:** shadcn init requires Tailwind CSS pre-installed; it was not installed
- **Fix:** Installed tailwindcss + @tailwindcss/postcss + postcss first, created postcss.config.mjs, then ran shadcn init
- **Files modified:** apps/web/package.json, apps/web/postcss.config.mjs
- **Committed in:** bdf0ab7 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were necessary to complete the task. No scope creep.

## Issues Encountered

- pnpm not available in bash PATH at start of session — resolved by using corepack to activate pnpm and pointing to the corepack-managed pnpm.js directly
- notifications.ts and user-preferences.ts already existed as untracked files from prior planning runs — confirmed correct schemas and committed them as part of Task 2

## Next Phase Readiness

- All UI libraries installed and importable — shadcn components in components/ui/
- ThemeProvider and QueryProvider in root layout — subsequent pages can use useTheme() and useQuery()
- useDashboardStore ready with skipHydration — pages add a useEffect rehydrate() call
- DB schema ready for Phase 4 plans — notifications and user_preferences tables with RLS
- Migration 0004 ready to run against production DB alongside 0003

---
*Phase: 04-recommendations-and-dashboard*
*Completed: 2026-02-24*
