# Dock Demos A/B — Choreography and Perspectives

Layouts that rebuild themselves: a themed dock workspace where every transition is a real,
committed `dockZone.v1` operation — split, resize, tab-fold, auto-hide — played as a scripted,
deterministic tour. The ticking clock in the editor pane is the continuity witness: wall-time
truth a viewer verifies with their own eyes while the layout reorganizes around it.

The default route runs Demo A's choreography. Add `?demo=b` for Demo B's named perspectives
and shared-heap pop-out journey. The dense living-data Workstation is a standalone application at
`apps/workstation/`; it is not an AgentOS dockdemo mode.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/apps/agentos/childapps/dockdemo/index.html
```

The non-interactive theme build creates the ignored development CSS and `theme-map.json`
artifacts a fresh checkout does not contain.

## The tour

Press **▶ Tour**. Three scenes play as one deterministic operation sequence (18 beats):

1. **Split choreography** — the terminal enters low and settles to the golden ratio.
2. **Tab dance** — panes fold into a shared tab group; emptied nodes prune themselves;
   no state is lost, the one committed document just gets denser.
3. **Auto-hide wave** — the residents tuck to labeled right-edge rail tabs, the editor
   floods the stage, and the wave rolls back — a layout remembering itself.

The caption bar narrates each beat in operation vocabulary (the tour teaches the API by
speaking it), and the pip strip tracks progress. A second click mid-tour is a strict no-op;
after completion it resets the stage and replays — identically, every time.

Every beat dispatches through the same executor seam an agent uses via the Neural Link
`execute_dock_operation` tool: the tour and a live agent are indistinguishable at the
document layer. The screenplay itself lives in
[`apps/agentos/tour/demoADockChoreography.mjs`](../../tour/demoADockChoreography.mjs) —
data only, validated fail-closed, replayed byte-identically by the unit specs.

## Recording a take

The tour runner's `record` mode exists so two takes of the same script are the same video:

- pacing is pinned to the script's authored durations (no multiplier),
- the operation order is provably identical to `demo`/`spec` runs (timestamp-free logs),
- and the runner **refuses to start** unless the hosting surface probed
  `prefers-reduced-motion` and passed `reducedMotion: false` — a capture with motion
  disabled would record a lie about the product.

The play button runs `demo` mode; for a capture, drive the runner in `record` mode (e.g.
via the Neural Link or a `mode: 'record'` runner config) with the reduced-motion probe
wired, start the screen capture, then trigger the run. Public-safe content only — the
screenplay contains no client names and no performance claims.
