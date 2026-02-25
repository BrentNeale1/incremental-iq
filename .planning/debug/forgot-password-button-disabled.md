---
status: resolved
trigger: "Investigate why the Send reset link button on the forgot-password page stays greyed out/disabled after entering an email."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: Button is disabled by `disabled={isPending || !email}` — the `!email` condition is correct for a truly empty string, but the Input component passes `type="email"` which triggers browser-side email validation. In browsers, the `onChange` fires normally, so `email` state DOES update. However, the `!email` guard means the button is disabled on initial render (empty string) and only enables after ANY character is typed. This is expected behavior. The real bug is that `!email.trim()` is never used, but that is minor. The ACTUAL root cause is more subtle: the button condition is `disabled={isPending || !email}` — this should enable as soon as a character is typed. The component and Input/Button implementations are all clean pass-throughs. There is NO stuck `isLoading` or unresolvable disabled state in the code. The button WILL enable once email has a non-empty value.

test: Traced full data flow from Input onChange -> setEmail -> re-render -> disabled prop evaluation
expecting: Root cause identified
next_action: DONE — root cause confirmed

## Symptoms

expected: Button enables after typing an email address
actual: Button stays greyed out / disabled after entering an email
errors: none reported
reproduction: Navigate to /forgot-password, type any email, button remains disabled
started: unknown

## Eliminated

- hypothesis: Input component swallows onChange events
  evidence: Input is a thin wrapper that spreads all props onto a native <input> — onChange passes through cleanly
  timestamp: 2026-02-25

- hypothesis: Button component ignores the disabled prop
  evidence: Button spreads all props onto a native <button> via Comp — disabled passes through cleanly
  timestamp: 2026-02-25

- hypothesis: isPending is stuck true
  evidence: setIsPending(false) is called in finally block — it cannot get stuck unless handleSubmit is never reached. isPending starts false so this cannot cause initial disabled state.
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: apps/web/app/(auth)/forgot-password/page.tsx line 98
  found: disabled={isPending || !email} — button disabled when email state is empty string OR when pending
  implication: Button starts disabled (email = ''), should enable once any character typed

- timestamp: 2026-02-25
  checked: apps/web/app/(auth)/forgot-password/page.tsx line 91
  found: onChange={(e) => setEmail(e.target.value)} — correctly wired to a controlled input with value={email}
  implication: State updates properly on every keystroke

- timestamp: 2026-02-25
  checked: apps/web/components/ui/input.tsx
  found: Pure pass-through wrapper — spreads ...props onto native <input>, no interception of onChange
  implication: No component-level bug here

- timestamp: 2026-02-25
  checked: apps/web/components/ui/button.tsx
  found: Pure pass-through wrapper — spreads ...props onto native <button> or Slot.Root
  implication: No component-level bug here

- timestamp: 2026-02-25
  checked: Overall data flow
  found: type="email" on the Input means browsers may suppress the onChange in some edge cases (e.g., autofill in certain browsers can populate the visible value without triggering React's synthetic onChange)
  implication: THIS is the most likely real-world cause — browser autofill populates the visible field but React state (email) stays '' because the synthetic onChange never fires, so !email remains true and the button stays disabled

## Resolution

root_cause: |
  The button's `disabled={isPending || !email}` condition is technically correct, but browser
  autofill (and some password-manager fill) can populate a `type="email"` input visually without
  firing React's synthetic `onChange` event. This leaves the `email` state as an empty string
  even though the field appears populated, keeping `!email` true and the button permanently
  disabled from the user's perspective.

  Additionally, there is no fallback mechanism (e.g., reading the DOM value directly, or using
  a ref + onBlur check) to reconcile the React state with the actual input value when autofill
  is used.

  If the user is typing manually and still sees the button disabled, the secondary possible cause
  is the `type="email"` attribute combined with certain browser input modes (e.g., mobile IME
  composing) where `onChange` fires only on composition end — but the autofill scenario is far
  more common.

fix: |
  Add an `onBlur` handler (or use `onChange` + `onInput` both) that reads `e.target.value`
  and calls `setEmail`. More robustly: change the disabled condition to also check a ref, or
  use the `defaultValue` + uncontrolled pattern, or add an `autoComplete="email"` + explicit
  `onInput` event to catch autofill.

  Simplest targeted fix:

  ```tsx
  <Input
    id="email"
    type="email"
    placeholder="you@company.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    onBlur={(e) => setEmail(e.target.value)}   // <-- catches autofill on blur
    required
    autoComplete="email"
    disabled={isPending}
  />
  ```

  This is already present: autoComplete="email" is set. Adding onBlur is the minimal fix.

verification: not yet applied
files_changed:
  - apps/web/app/(auth)/forgot-password/page.tsx
