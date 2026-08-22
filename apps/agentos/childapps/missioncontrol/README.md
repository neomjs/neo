# Mission Control — the Fleet Manager under its own tour host

This is **not** a dock demo, which is why it stayed in the product app when the demos left for
`examples/dashboard/`. `MissionControlWorkspace` **composes the production `FleetCockpit`
unchanged** — the literal product class, self-booting its own `dockService` and `dockModel` — and
owns only the tour orchestration around it: the `TourRunner`, the play control, the caption feed
and the settled-cue chain.

The cockpit manages a real fleet; this host proves and presents it. Relocating it beside the demos
would have made an `examples/` app import the application, which is the dependency this relocation
exists to remove — pointed the other way.

**Composition, never a fork.** The host drives the cockpit exactly as an external agent would over
the Neural Link: through that live instance's own PUBLIC verbs. No demo-only code is added to the
product and no new product API is invented, so every screenplay, replay and beat-log falsifier is
preserved — addressed to this host rather than to the cockpit.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/apps/agentos/childapps/missioncontrol/index.html
```

There is one route. The `?demo=` switch is gone: the demo modes it selected now live at
`examples/dashboard/choreography/` and `examples/dashboard/crossWindow/`.

## The two tours

Both screenplays are data — validated fail-closed and replayed byte-identically by their unit specs.

| screenplay | driven by |
|---|---|
| [`fusionFlagship.mjs`](../../tour/fusionFlagship.mjs) | the **▶ Tour** play button |
| [`missionControlWalkthrough.mjs`](../../tour/missionControlWalkthrough.mjs) | programmatically, via `playWalkthroughTour()` — its e2e leg and the recording pipeline |

**The single-flight take contract** mirrors the cockpit's former one exactly: `tourRunner` is
claimed synchronously before any await, so a concurrent play refuses at the guard; the report
publishes CURRENT-attempt truth, so a prior take's success can never leak into a failed run; the
runner never awaits host cues, so the settled cue chain must drain before a report exists; and the
`finally` releases ownership and restores any activity-stream state a burst displaced.

Public-safe content only — the screenplays carry no client names and no performance claims.
