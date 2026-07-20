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

Witness family: headed real-browser runs under `test/playwright/playwright.config.matrix.mjs`;
headless proves wiring, never native placement. Rows 1–3 use
`test/playwright/e2e/colors/tearOutMatrix.spec.mjs` on the grammar's original live surface
(`useSharedWorkers: true`, `popupUrl` wired to its dedicated widget shell, explicit
`neo-draggable` panel-header handles). Rows 4–7 use Demo B, the merged dock-tier composition
surface that owns worker-stable workspace identity, live pane instances, cross-window claims,
and terminal machines. Density context for the G1 calibration remains the flagship workstation
— 20 items / 9 nodes / 6 tab nodes (1·12·2·2·1·2 distribution).

Runner provenance receipt (2026-07-19): the matrix config pins its one resolved port into
`NEO_E2E_PORT`, while the Colors witness navigates relative to Playwright's configured
`baseURL`. The web server and page therefore consume one authority; there is no fallback 8080
route left for a foreign checkout to satisfy. A fresh unpinned row-2 run selected port `64544`
and passed against that same server.

## Verdict vocabulary

- `PASS_NATIVE` — the native path works as designed on this platform.
- `PASS_FALLBACK` — the native path fails, and a documented DOM-proxy or explicit-command
  fallback covers the row.
- `FAIL` — neither native nor documented fallback covers the row.
- `NOT_YET_MEASURED` — no qualifying headed environment has executed the cell yet. An honest
  hole, never a guess.

**Universal invariants — REQUIRED in every completed cell** (a cell's verdict is admissible only
when its receipts assert all five): gesture continuity · same-instance permanence · JSON-only
persisted state · exact-once commit · idempotent cleanup. A completed cell names its full receipt
below; cells whose probes do not yet assert all five remain `NOT_YET_MEASURED`. Any confirmed
`FAIL` on a universal invariant fires the epic's `revalidationTrigger` (reopen the design
discussion, pause consuming implementation).

## The matrix

| # | Row | macOS (Chrome, headed) | Windows | Linux |
|---|---|---|---|---|
| 1 | Hysteretic grammar (0.8 out / 0.6 in, direction-aware) | `NOT_YET_MEASURED` ¹ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 2 | Acquisition (`window.open` boolean; activation window) | `NOT_YET_MEASURED` ² | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 3 | Moving embodiment (requested-vs-observed `moveTo`) | `NOT_YET_MEASURED` ³ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 4 | Object permanence / reintegration (same instance back) | `PASS_NATIVE` ⁴ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 5 | Screen topology (`getScreenDetails` never a prerequisite) | `PASS_FALLBACK` ⁵ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 6 | Multi-window targeting (claim-protocol identity binding) | `NOT_YET_MEASURED` ⁷ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |
| 7 | Terminal cleanup (exact-once, idempotent) | `PASS_NATIVE` ⁶ | `NOT_YET_MEASURED` | `NOT_YET_MEASURED` |

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

⁴ Row 4 macOS — **`PASS_NATIVE`** (2026-07-19, headed Chrome 150, 1/1,
`test/playwright/e2e/agentos/FleetPermanenceMatrixRow4NL.spec.mjs`): the live-`data.Store`
receipt the earlier RED control named missing (Demo B exposes no store; the Fleet surface is
the honest product path). The native card drill seated the `AgentDetail` inspector; the shell
toggle moved the SAME App-Worker instance into the real vessel window. While detached, the
drilled resident's live `FleetAgent` record was mutated through the store (`record.set` via the
card's live-record dot-path): the store's `recordChange` reached the DETACHED inspector — the
vessel rendered the mutated lane (polled, DOM-observed via `toContainText`), proving streaming stays live
across the hop. Reattach terminally closed the vessel; the SAME detail instance, the same record
identity (same store, same key, mutation persisted — one continuous record, never a re-fetched
copy), and an unchanged grid census completed the permanence proof. All five universal
invariants asserted: gesture continuity (native clicks throughout), same-instance permanence
(detail id stable across both hops), JSON-only persisted state (dock document round-trip),
exact-once (single detail instance; single vessel terminal close), idempotent cleanup (zero
popup residue, empty error ledgers). The witness restores the fixture's baseline lane at exit.

⁷ Row 6 macOS — **verdict blocked on a design authority, not a test** (2026-07-19): the cell
requires at least three REGISTERED claim targets; today's Demo B exposes three physical windows
but only two registered workspaces, and counting the competing tear-out vessel as a claimant is
a false receipt (see the competing-vessel RED control preserved below). A third registered
workspace is a production/design question (Demo B workspace-set composition), outside the
matrix's test-only scope. The cell remains `NOT_YET_MEASURED` until that authority lands;
no simulated third page will stand in.

**Rows 4 / 6 — earlier RED controls (2026-07-19, Chrome, preserved):** a headed live Neural Link
run of Demo B's real `executeCrossWindowStep()` opened both the intended
`?workspaceId=demo-b-popup` target and an unintended `?popout=workbench` tear-out vessel. Worker
truth then held two registered workspaces but three physical windows; the CounterPane's live
`windowId` named the tear-out vessel while `crossWindowTargetWindowId` named the workspace
target. The exact canonical full-journey control
`DemoBPerspectivesNL.spec.mjs` failed because the intended popup never rendered the live
CounterPane. The narrower `DemoBCrossWindowDragNL.spec.mjs` stayed green while logging three
window connections, proving that its current receipt does not falsify competing-vessel identity.
The composition repair belongs to #15396; this matrix does not absorb it. Row 4's former second
gap (Demo B exposes no `Neo.data.Store`) is now CLOSED by the Fleet-surface receipt above.

**#15396 green control (2026-07-19, verdicts still pending):** the matrix runner now includes the
full Demo B cross-window journey. Its macOS/Chrome headed round-trip externally observes exactly
one `?popout=workbench` Playwright `Page`, instruments browser-realm `window.open` independently of
the app counter, verifies that the same `Page` survives park → re-show → detached terminal, records
requested-vs-observed park and restore coordinates, and verifies that the cover target remains
focused after the source move. The worker independently proves identical CounterPane id, exact
single remount, exact runtime window id / opaque handle, and zero transfer/local/remote double
commit. This resolves the earlier competing-vessel false-green for this macOS journey; it does not
mint a row verdict. Rows 3/6 still
need their complete per-row universal-invariant receipts, and Windows/Linux remain unmeasured.

⁵ Row 5 macOS — **`PASS_FALLBACK`** (2026-07-19, headed Chrome 150, 3/3 serial): the witness
bound `Browser.setPermission` to Playwright's actual browser context, observed the
`window-management` permission as `denied`, and observed `getScreenDetails()` reject with
`NotAllowedError`. Demo B's real boundary gesture still opened exactly one `?popout=workbench`
vessel; exact-head source inspection identifies its ordinary `Neo.Main.getWindowData`
screen/window-metrics path, while the headed receipt independently proves permission denial does
not block it. All five
universal invariants passed: the gesture survived four post-birth moves; the CounterPane kept
the same `neo-component-1` identity with heartbeat `0 → 1 → 2` and mount count `1 → 2 → 3`;
the real saved-perspective writer accepted both detached and returned documents into its
JSON-only collection; detach removed the item from the tree while preserving its catalog entry
and native `window.close()` restored exactly one semantic home; all three lifecycle maps cleared,
and repeating the same disconnect terminal made no further state change. Main-page and popup
window error ledgers were empty in every run; SharedWorker console output was not claimed.

⁶ Row 7 macOS — **`PASS_NATIVE`** (2026-07-19, headed Chrome 150, 4/4 file run): three terminal
branches drove Demo B's real boundary-gesture surface and worker lifecycle. A committed drop
opened one native vessel, detached exactly once, kept the same CounterPane while its mount count
advanced `1 → 2`, treated a repeated drop terminal as a no-op, and restored exactly one semantic
home on native close with mount count `3`; a repeated disconnect made no further state change. A
post-birth cancel kept the document byte-equivalent, restored that same pane with mount count
`1 → 3`, cleared every lifecycle owner/map, and treated a repeated cancel as a no-op. The blocked
control returned `null` from a test-owned wrapper at the real browser `window.open` boundary on
every retry: three browser calls in this run matched the worker's acquisition counter exactly,
while the pane stayed mounted once, the model stayed unchanged, no popup existed, every owner/map
was empty, and a repeated cancel remained a no-op. Every terminal persisted its real perspective
writer output through a JSON round-trip; page, popup, and browser-runtime error ledgers stayed
empty. The controlled `window.open` failure proves row 7's fail-closed cleanup only — it does NOT
advance row 2's real popup-blocking / activation verdict.

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
