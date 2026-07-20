# Seat Evidence Capabilities

Per-seat, time-stamped records of which evidence classes each maintainer seat's host can
produce — the routing input for visual, headed-harness, and native-matrix verification work.

**Authority boundary:** these are *observations*, never traits. Per ADR 0032 §2.3.3,
capability/model/family facts live on time-scoped eras, never flat on durable `AgentIdentity`.
This document is the documented-convention interim; the queryable form migrates to the
IdentityState / Fleet-registry line (#11318 / #13015) when that substrate lands. The vocabulary
and state enum below are chosen so the records migrate without translation.

## Evidence-class vocabulary

| Class | Meaning |
|---|---|
| `visual-render` | Headed/headless real-browser renders, golden comparisons, screenshot censuses (per-platform goldens — CI produces none by design) |
| `headed-electron` | Headed Electron harness witnesses (app boot, lifecycle receipts) |
| `headed-native-browser` | Native headed-browser matrix receipts (QT portability matrix cells) |
| `ci-virtual-display` | CI / virtual-display runs — **explicitly not** native-placement evidence; never promoted to the classes above |

## State enum

| State | Meaning |
|---|---|
| `positive` | Verified producer — a receipt exists for this class on this seat's host |
| `negative` | Known ceiling — a recorded incident shows this class failing on this host |
| `unknown` | Unmeasured, or the last observation is past its revalidation trigger |

## Record shape

Each record carries: `state` · `observedAt` (ISO date) · environment grain (host OS, harness,
GPU-relevant notes) · receipt/incident link · `revalidationTrigger`.

**Freshness rule:** a record past its `revalidationTrigger`, or made after any host/harness
change on that seat, renders as `unknown` until re-run. Stale is never stale-positive.

**Write authority:** each seat writes its OWN record (self-observation + receipts). The operator
may override any record. Peers may attach a counter-receipt (a fresh re-run of the same class)
but never overwrite another seat's record.

## Advisory consumers

These flows SHOULD consult this document before routing evidence-class work. The records are
**advisory only**: they inform a peer's choice — they never type an identity, never assign
unilaterally, and never block a seat from attempting a class (a `negative` record is an
expectation, not a ban; counter-receipts are how ceilings retire).

- `pr-review` — visual-evidence seat selection for UI PRs
- `whitebox-e2e` — headed journey / harness witness routing
- QT portability matrix assignment (#15243 line) — native headed-browser cells

## Seat records

### @neo-kimi-phoebe / @neo-kimi-iris (shared macOS host)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | positive | 2026-07-19 | macOS, Apple Silicon, real Chrome | AgentCard censuses + golden comparisons (#15538/#15547 review evidence) | host change or 30d |
| `headed-electron` | positive | 2026-07-19 | macOS, Electron harness | #15566 AC9 witness: `smoke:brain` zero leaks, `witness:lifecycle` passed | host change or 30d |
| `headed-native-browser` | positive | 2026-07-19 | macOS, headed Chrome | QT matrix rows 4/5/7 PASS (#15552, #15589) | host change or 30d |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-gpt / @neo-gpt-emmy / @neo-gpt-euclid (shared macOS host)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | negative | 2026-07-19 | macOS, `ApplicationServices` registration failure aborts headless Chrome pre-page | recorded by Emmy on #15538 + #15566 headed attempt | re-run after host fix |
| `headed-electron` | negative | 2026-07-19 | macOS, same registration failure class | #15566 AC9 witness could not produce on this host | re-run after host fix |
| `headed-native-browser` | unknown | — | unmeasured | — | — |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-opus-* (Claude-family seats; shared macOS host — same machine as the Kimi/GPT seats, separate checkouts)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | negative | 2026-07-18 | **harness-scoped** (Grace's in-app browser wedged, 300s timeout, on the AgentCard design evidence) — host scope unconfirmed; do not generalize to the host without a run | #15536/#15538 review thread | re-run after harness update |
| `headed-electron` | unknown | — | unmeasured | — | — |
| `headed-native-browser` | unknown | — | unmeasured | — | — |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-fable-* / @neo-gemini-pro

All classes `unknown` — unmeasured (Fable seats rate-limited until the Friday reset; Gemini seat
benched). First measurement welcome: run any class and attach the receipt.

## Founding incident log

1. **2026-07-18/19 — render ceiling (two hosts).** Grace's in-app browser wedged (300s) on the
   AgentCard census; the GPT host's `ApplicationServices` failure aborted headless Chrome. All
   render evidence that week came from the Kimi host.
2. **2026-07-19 — harness ceiling.** #15566's AC9 headed-Electron witness could not be produced
   on the GPT host; the Kimi host ran it clean. Discovered mid-review, not planned — the routing
   blindness this document exists to retire.
3. **2026-07-19 — matrix concentration.** Every headed QT matrix receipt (rows 4/5/7) ran on the
   Kimi host; Windows/Linux cells remain unmeasured for lack of real desktops elsewhere.

## Fallback rule

When no seat is `positive` for a required class: the work **parks honestly** (the QT matrix's
existing pattern) — the evidence requirement is recorded as an explicit residual, never silently
substituted. `ci-virtual-display` output is never promoted to native/headed evidence. The
requesting peer escalates to the operator for the hardware/VM decision, and the class carries a
revalidation trigger for the next capable host.

## Migration path

When the IdentityState era substrate (#11318) or the Fleet registry (#13015) lands a capability
surface, these records move verbatim: same classes, same states, `observedAt` becomes the era
boundary. This document then retires to a pointer.
