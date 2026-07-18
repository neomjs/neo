# The Tear-Out Portability Matrix

**An empirical EVIDENCE LEDGER — subordinate to its authorities, never normative itself.** This
document accumulates the measured per-platform receipts for the multi-window tear-out lineage
(Dynamic Proxy Transitioning + intersection-ratio hysteresis + the live-popup embodiment).
Multi-window implementation defaults — acquisition path, moving embodiment, fallbacks — are
selected by CITING this ledger's receipts, under the authority of ADR 0029 and the live matrix
contract: WHATWG activation, `moveTo` throttling, and screen-topology permissions all vary by
platform, and assumption is not evidence.

Authority chain (this ledger sits at the BOTTOM): Discussion #15204 OQ2 `[RESOLVED_TO_AC]` (the
ratified matrix contract) → issue #15243 (OPEN — owns the complete 7×3 result and the
revalidation gate) → this ledger (the accumulating receipts its children produce). The ledger
is registered hidden in the learn tree: an internal evidence surface, not a public-facing
guide.

## The grammar under test

One transition chain, end to end — no new window manager, no second dwell coordinator:

1. `src/draggable/container/SortZone.mjs` `checkWindowBoundary()` — direction-aware
   intersection-ratio hysteresis (`intersectionArea / proxyArea`; defaults `detachThreshold: 0.8`
   on the way out, `reattachThreshold: 0.6` on the way back in).
2. `src/dashboard/Container.mjs` `onDragBoundaryExit()` → `openWidgetInPopup()` — the mid-gesture
   conversion to a real, URL-addressed OS popup on the shared heap.
3. `src/main/addon/DragDrop.mjs` pointer-follow (`windowMoveTo`) — the moving embodiment.

Witness suite: `test/playwright/e2e/colors/tearOutMatrix.spec.mjs` (headed real-browser runs;
headless proves wiring, never native placement). The measurement surface is the colors app —
the landed grammar's original live product surface (`useSharedWorkers: true`, `popupUrl` wired
to its dedicated widget shell, explicit `neo-draggable` panel-header handles). Dock-tier
surfaces (workstation, dockdemo) opt OUT of the grammar until the G1 leaf lands — they cannot
serve as measurement surfaces yet. Density context for the G1 calibration remains the flagship
workstation — 20 items / 9 nodes / 6 tab nodes (1·12·2·2·1·2 distribution).

## Verdict vocabulary

- `PASS_NATIVE` — the native path works as designed on this platform.
- `PASS_FALLBACK` — the native path fails, and a documented DOM-proxy or explicit-command
  fallback covers the row.
- `FAIL` — neither native nor documented fallback covers the row.
- `NOT_YET_MEASURED` — no qualifying headed environment has executed the cell yet. An honest
  hole, never a guess.

**Universal invariants — REQUIRED in every completed cell** (a cell's verdict is admissible only
when its receipts assert all five): gesture continuity · same-instance permanence · JSON-only
persisted state · exact-once commit · idempotent cleanup. The current qualified probes do NOT
yet assert them — which is exactly why every cell below remains `NOT_YET_MEASURED`. Any
confirmed `FAIL` on a universal invariant fires the epic's `revalidationTrigger` (reopen the
design discussion, pause consuming implementation).

## The matrix

| # | Row | macOS (Chrome, headed) | Windows | Linux |
|---|---|---|---|---|
| 1 | Hysteretic grammar (0.8 out / 0.6 in, direction-aware) | `NOT_YET_MEASURED` ¹ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 2 | Acquisition (`window.open` boolean; activation window) | `NOT_YET_MEASURED` ² | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 3 | Moving embodiment (requested-vs-observed `moveTo`) | `NOT_YET_MEASURED` ³ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 4 | Object permanence / reintegration (same instance back) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 5 | Screen topology (`getScreenDetails` never a prerequisite) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 6 | Multi-window targeting (claim-protocol identity binding) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 7 | Terminal cleanup (exact-once, idempotent) | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |

Environment note: the current fleet has a qualifying **macOS** headed environment. Windows and
Linux columns require real desktop sessions (a virtual display proves wiring, not native
placement semantics) and remain honestly `NOT_YET_MEASURED` until such environments exist.

¹ Row 1 macOS — **qualified PROBE receipts, verdict pending** (2026-07-18, Chrome via the
matrix runner): the probes witnessed boundary-exit under the documented hysteresis, MID-GESTURE
popup acquisition, popup persistence through the drop terminal, and Neo-rendered content in the
popup. The verdict awaits its named sub-receipts: the ratio-trace no-oscillation assertion
(reads `SortZone.traces`) and a stronger same-instance adoption receipt (the current evidence
is `[id^=neo-]`-level rendering, not an instance-id identity check). The earlier nondeterminism
(3× green → reap; see ³) is RESOLVED by the merged birth-race fix — post-fix confirmation ran
6/6 green on this exact witness.

² Row 2 macOS — **qualified PROBE receipts, verdict pending**: mid-gesture `window.open`
succeeds during the gesture (row-1 probes). But TWO instrument caveats block the verdict:
the **>5 s activation-expiry negative control is UNMEASURABLE UNDER AUTOMATION** (decay-trace
receipts: `navigator.userActivation.isActive` still `true` at 2/4/6/8 s into a held CDP-input
gesture AND after release — synthesized input sustains transient activation indefinitely), and
**the matrix runner itself carries Playwright's default `--disable-popup-blocking`**, so no
blocked-acquisition cell has been measured under real blocking conditions yet. Consequence for
the G2 acquisition contract: **never calibrate activation timings from automated runs**; the
expiry half + the blocking-controlled cells require real-input / blocking-controlled
measurement. The release-time-`window.open` negative baseline stands on spec authority, not on
this instrument.

³ Row 3 macOS (2026-07-18): the earlier "sustained movement closes the popup" observation is
**RETIRED — the truth is sharper and worse**: with the close-listener attached inside the
acquisition race, the popup closed **2 ms after birth** (`acquiredToCloseMs: 2`), BEFORE the
first continued move (`closedAfterMoveMs: -30`), before pointer-up (`closedBeforeUp: true`),
with zero console output captured — **and that absence was INSTRUMENT-BLIND, not negative**: the
colors app runs on a SharedWorker, whose console `page.on('console')` cannot see, so the
re-entry path's own log line was invisible to this witness (the earlier "no re-entry
involvement" phrasing was retracted; sweep scope was the page console only). Same-choreography
runs nondeterministically
survive (row 1's three earlier greens) or reap at birth — **a race between the continuing
pointer-move stream and the popup-birth / `startWindowDrag` handoff**, silently violating the
gesture-continuity universal invariant when it fires. **Reproduction-rate receipt
(2026-07-18, --repeat-each=6): 5/6 REAP, 1/6 survive — the reap is the DOMINANT outcome under
this witness** (session total: ~8 reaps across 12 same-choreography runs). Instrument caveat,
carried honestly per footnote ²'s lesson: the rate is measured under CDP-synthesized input,
which this same suite proved distorts activation semantics — the real-input reap rate is
unknown (the flagship demo's manual operation suggests real-mouse tear-outs succeed at a far
higher rate). **RESOLVED (2026-07-18):** the race was attributed (a false re-entry — the exit's own layout
choreography jumped the hysteresis read) and FIXED at mechanism in PR #15413 (Schmitt-trigger
arming, merged); this ledger's own witness confirmed 6/6 survivals post-fix against the exact
pre-fix baseline, and the post-rebase run holds 3/3. The `revalidationTrigger` question is
resolved-as-fixed; rows 4–7 are measurable again as #15243 children.

**Attribution hypothesis (source-anchored, falsifier-backed):** the boundary-EXIT reconfigures
the exact geometry the hysteresis reads — the drag placeholder hides and the remaining items
expand (`SortZone#startWindowDrag` choreography), so on the NEXT pointer move
`checkWindowBoundary`'s direction-aware ratio can JUMP upward (reading as "moving in" above the
0.6 reattach threshold) → a false `dragBoundaryEntry` → `Container#onDragBoundaryEntry` →
`Neo.Main.windowClose` — the silent ~2 ms reap. The run distribution is the falsifier already
executed: survivals correlate with zero post-birth moves (the witness loop stopping at
acquisition); reaps with ≥1 extra move inside the acquisition race window. Fix candidates for
the attribution ticket: reset `lastIntersectionRatio` at exit; require N consecutive moving-in
samples before re-entry; gate re-entry on the live proxy rect rather than post-exit layout
geometry. Direct consumer warning: G1 ships this exact grammar to dock surfaces —
the race predates G1 and must be attributed before dock-tier calibration lands on top of it.
Requested-vs-observed `moveTo` sampling remains blocked behind the race (a 2 ms lifetime cannot
be position-sampled).

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
