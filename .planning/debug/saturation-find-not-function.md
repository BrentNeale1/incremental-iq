---
status: diagnosed
trigger: "TypeError: saturationData.find is not a function at insights/page.tsx line 76"
created: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:00:00Z
---

## Current Focus

hypothesis: API returns SaturationDetailResponse object (not array) when campaignId is provided, but hook types it as SaturationCurve[]
test: Read API route to confirm response shape per mode
expecting: campaignId branch returns { campaign, curvePoints, currentSpendLevel } object
next_action: DIAGNOSED - return root cause

## Symptoms

expected: saturationData.find() works because useSaturation types data as SaturationCurve[]
actual: TypeError at runtime — saturationData.find is not a function
errors: saturationData.find is not a function
reproduction: Select a campaign row in the DrillDownTable on the insights page
started: Likely since the campaign-detail mode was added to the saturation API

## Eliminated

(none needed — root cause found on first pass)

## Evidence

- timestamp: 2026-02-26T00:00:00Z
  checked: page.tsx line 64 — how saturationData is sourced
  found: `const { data: saturationData } = useSaturation(selectedRow?.id)` — passes campaignId when a row is selected
  implication: When a row is selected, the hook fetches with campaignId param

- timestamp: 2026-02-26T00:00:00Z
  checked: useSaturation.ts hook definition
  found: Hook declares return type as `useQuery<SaturationCurve[]>` and casts `res.json() as Promise<SaturationCurve[]>` (line 29, 39)
  implication: TypeScript thinks data is always SaturationCurve[], but this is a type assertion — no runtime validation

- timestamp: 2026-02-26T00:00:00Z
  checked: API route /api/dashboard/saturation/route.ts — response shape
  found: TWO distinct response modes:
    1. Without campaignId (line 241): returns `SaturationRow[]` — an array
    2. With campaignId (line 177): returns `SaturationDetailResponse` — an OBJECT `{ campaign, curvePoints, currentSpendLevel }`
  implication: This is the root cause. When selectedRow is set, the hook passes campaignId to the API, which returns an object, not an array.

- timestamp: 2026-02-26T00:00:00Z
  checked: Type definition on API route line 54
  found: `type SaturationResponse = SaturationRow[] | SaturationDetailResponse` — the API explicitly declares it returns a union type
  implication: The hook incorrectly narrows this to just the array variant

## Resolution

root_cause: |
  The API route GET /api/dashboard/saturation has two response modes:

  1. Overview mode (no campaignId): Returns SaturationRow[] (an array)
  2. Detail mode (with campaignId): Returns SaturationDetailResponse — an OBJECT with shape { campaign: SaturationRow, curvePoints: CurveDataPoint[], currentSpendLevel: number }

  The useSaturation hook (useSaturation.ts line 29) types the return as `useQuery<SaturationCurve[]>`, blindly casting res.json() as an array regardless of which API mode was used.

  In page.tsx, `useSaturation(selectedRow?.id)` is called with a campaignId when a row is selected. This triggers the detail mode, which returns an object. The truthy guard `!saturationData` passes (objects are truthy), but `.find()` fails because objects don't have a .find() method.

  The type mismatch is hidden at compile time by the `as Promise<SaturationCurve[]>` cast but explodes at runtime.

fix: (not applied — diagnosis only)
verification: (not applied — diagnosis only)
files_changed: []
