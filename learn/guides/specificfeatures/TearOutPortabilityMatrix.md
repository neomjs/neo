# The Tear-Out Portability Matrix

The measured per-platform truth for the multi-window tear-out lineage (Dynamic Proxy
Transitioning + intersection-ratio hysteresis + the live-popup embodiment). Multi-window
implementation defaults — acquisition path, moving embodiment, fallbacks — are selected FROM this
matrix, never from assumption: WHATWG activation, `moveTo` throttling, and screen-topology
permissions all vary by platform.

Authority chain: Discussion #15204 OQ2 `[RESOLVED_TO_AC]` (the ratified matrix contract) →
issue #15243 (the executing spike) → this document (the committed result the G1/G2
implementation leaves cite as their defaults-selection authority).

## The grammar under test

One transition chain, end to end — no new window manager, no second dwell coordinator:

1. `src/draggable/container/SortZone.mjs` `checkWindowBoundary()` — direction-aware
   intersection-ratio hysteresis (`intersectionArea / proxyArea`; defaults `detachThreshold: 0.8`
   on the way out, `reattachThreshold: 0.6` on the way back in).
2. `src/dashboard/Container.mjs` `onDragBoundaryExit()` → `openWidgetInPopup()` — the mid-gesture
   conversion to a real, URL-addressed OS popup on the shared heap.
3. `src/main/addon/DragDrop.mjs` pointer-follow (`windowMoveTo`) — the moving embodiment.

Witness suite: `test/playwright/e2e/workstation/tearOutMatrix.spec.mjs` (headed real-browser
runs; headless proves wiring, never native placement). Density context: the flagship workstation
surface — 20 items / 9 nodes / 6 tab nodes (1·12·2·2·1·2 distribution).

## Verdict vocabulary

- `PASS_NATIVE` — the native path works as designed on this platform.
- `PASS_FALLBACK` — the native path fails, and a documented DOM-proxy or explicit-command
  fallback covers the row.
- `FAIL` — neither native nor documented fallback covers the row.
- `NOT_YET_MEASURED` — no qualifying headed environment has executed the cell yet. An honest
  hole, never a guess.

**Universal invariants asserted in every cell:** gesture continuity · same-instance permanence ·
JSON-only persisted state · exact-once commit · idempotent cleanup. Any `FAIL` on a universal
invariant fires the epic's `revalidationTrigger` (reopen the design discussion, pause consuming
implementation).

## The matrix

| # | Row | macOS (Chromium, headed) | Windows | Linux |
|---|---|---|---|---|
| 1 | Hysteretic grammar (0.8 out / 0.6 in, direction-aware) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 2 | Acquisition (`window.open` boolean; activation window) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 3 | Moving embodiment (requested-vs-observed `moveTo`) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 4 | Object permanence / reintegration (same instance back) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 5 | Screen topology (`getScreenDetails` never a prerequisite) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 6 | Multi-window targeting (claim-protocol identity binding) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 7 | Terminal cleanup (exact-once, idempotent) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |

Environment note: the current fleet has a qualifying **macOS** headed environment. Windows and
Linux columns require real desktop sessions (a virtual display proves wiring, not native
placement semantics) and remain honestly `NOT_YET_MEASURED` until such environments exist.

## Per-row receipt requirements

1. **Hysteretic grammar** — the recorded intersection-ratio trace across a slow boundary
   crossing: exit fires strictly below the detach threshold while moving out; re-entry restores
   strictly above the reattach threshold while moving in; no exit/re-entry oscillation between
   the two thresholds.
2. **Acquisition** — assert `window.open`'s BOOLEAN-shaped result: a blocked popup never throws,
   so try/catch-shaped acquisition silently passes its own failure. The negative control:
   `navigator.userActivation` measured at drag-end after more than 5 s of gesture — the expected
   portable failure that makes release-time `window.open` the negative baseline, never the
   default.
3. **Moving embodiment** — record requested vs observed coordinates for every `windowMoveTo`
   step; `moveTo` is advisory, never correctness authority.
4. **Object permanence** — the component instance id and store references before detach and
   after reintegration are identical (same-instance permanence, live data streaming across the
   transition).
5. **Screen topology** — the flow completes with `getScreenDetails` permission denied; denial
   degrades to the documented fallback, never blocks.
6. **Multi-window targeting** — the claim protocol's identity requirements bind (at most one
   target window exposes one menu and one preview per gesture); no arbitration is implemented
   here.
7. **Terminal cleanup** — every gesture terminal (drop, cancel, blocked acquisition) runs
   cleanup exactly once; a repeated terminal is a no-op.
