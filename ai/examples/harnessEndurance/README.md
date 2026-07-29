# Harness Endurance Benchmark (#13032)

A falsifier for the **session-age latency thesis**: *does Neo's worker topology keep the main thread MORE responsive than a single-main-thread renderer as a session grows to marathon length (10+ context compactions ≈ 100+ pages of chat)?*

Run as published, with its numbers — and **the negative result published with equal prominence** (falsifier honesty). The thesis did not survive a fair test.

## Method

- **Load** — `shared/LoadProfile.mjs`: a deterministic, seeded markdown-append stream (same `seed` + config → byte-identical stream on every run). Both subjects consume the **identical** sequence, so any delta is the engine's, not the input's.
- **Subject A — Neo** (`neo/`): the transcript renders through `Neo.component.markdown.Component` (`MarkdownVdom`) — **off-thread** parse + diff (App + VDom workers; the main thread is a thin DOM-applicator) and **`virtualize: true`** (only viewport-intersecting blocks + `bufferPages` mount).
- **Subject B — comparator** (`comparator/`): an honest **best-practice** single-main-thread page — incremental parse + tail-incremental render **and DOM-windowed** (`RENDER_WINDOW` blocks; older evicted). It is bounded at scale **like a virtualized list**. The only variable it lacks vs Neo is **where the parse/render runs** (on-thread vs off-thread).
- **Why both window** — an earlier cut left the comparator *non-virtualized*; at marathon scale its DOM bloated to ~130k nodes, and the resulting lag/heap gap was a **virtualization asymmetry**, not worker-topology (the conflation @neo-gpt flagged in the #13176 review). Windowing both isolates the one variable the benchmark claims to test.
- **Metrics** — main-thread event-loop lag sampled *while appending* at scale (the worker-topology signal; low = good), plus rendered DOM-node-count, heap, and full-vs-rendered transcript length. Captured by `test/playwright/e2e/benchmarks/HarnessEnduranceBenchmark.spec.mjs`.

## Results

**At small scale** (~390k transcript, ~10s window): **null.** Lag delta ≈ 0.1 ms (both ~1 ms). A competent incremental main-thread renderer keeps pace.

**At marathon scale** (multi-MB transcript / 100+ pages, **both subjects DOM-windowed**): **also null.** Representative run:

| Metric (marathon scale, both windowed) | Neo (off-thread) | best-practice comparator (on-thread) |
| :--- | :--- | :--- |
| Accumulated transcript | ~5.7M chars | ~15.6M chars |
| On-append event-loop lag (median) | **~1.0 ms** | **~0.7 ms** |
| Rendered DOM nodes (windowed) | ~100 | ~520 |

Both keep the main thread at the sampler floor (~1 ms); the difference is within noise (the comparator is, if anything, marginally ahead). Neo's off-thread topology provides **no raw main-thread-lag advantage** over a best-practice (incremental + windowed) main-thread renderer.

## Verdict

**The session-age worker-topology thesis is REFUTED for main-thread lag.** Across small and marathon scale, a competently-built main-thread renderer (incremental parse + windowed DOM) stays equally responsive. The dramatic "decisive win" an earlier cut reported was a **virtualization confound** — Neo virtualizes by default and that earlier comparator did not — corrected here by windowing both subjects.

What remains true, and is the honest claim: Neo's value at scale is **correct-by-construction**, not raw-lag superiority. You get off-thread parse/diff **and** transcript virtualization **for free** from `MarkdownVdom`; the comparator had to hand-roll incremental parsing *and* DOM windowing to merely keep pace. The engineering win is "you don't have to build any of that and it won't degrade," not "the main thread is faster under load."

## Reproduce

```
NEO_E2E_ENGINE_PROFILE=1 npm run test-e2e -- test/playwright/e2e/benchmarks/HarnessEnduranceBenchmark.spec.mjs
```

The `worker-topology at marathon scale` test logs `[endurance:marathon]` with the numbers above; the small-scale tests log `[endurance:neo|comparator|delta]`.
The explicit engine profile preserves the uncapped scheduling used for the published benchmark;
ordinary headed UI runs deliberately default to the presenting profile instead.

## Public-surface guardrail

These are **repo docs**. Any public-facing claim derived from this benchmark is a **separate, later step** and must be framed with the team — especially because the honest result is a *negative* (worker-topology gives no main-thread-lag edge vs a competent renderer), which is easy to mis-state in either direction.
