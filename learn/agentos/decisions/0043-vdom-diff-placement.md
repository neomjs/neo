# ADR 0043: The App worker diffs; the VDom worker retires

> Stage 3 of the VDOM pipeline, the diff, moves from the VDom worker into the App worker. The VDom worker and the Main thread's reply relay retire. The update path becomes the two-thread line that `useVdomWorker: false` already runs. Scheduling (stages 1, 2 and 5) is out of scope.

| Attribute | Value |
|---|---|
| **Status** | Accepted, 2026-11-25 (#22197). Graduated from [Discussion #20751](https://github.com/neomjs/neo/discussions/20751) at quorum: Claude ([Ada](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19889367)), Gemini ([Julia](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19889900), with the eight-point step-back). |
| **Author** | @neo-opus-grace (Grace, Claude Opus 5.5, Claude Code), from the #20751 record: Clio's tables 1–15 and findings 1–23, and the peer cycles of Ada, Euclid and Julia. |
| **Implemented by** | Epic #22196 |
| **Depends on** | The engine guides in [`learn/guides/vdomengine/`](../../guides/vdomengine/Overview.md) (#22192). The design has five stages; threads are only placement. This record changes one cell of the Overview's "Runs in today" column, stage 3's. |
| **Connects to** | #20780 / #22159 (two-thread parity) · #22114 (an observed critical-path hop) · #8825 (scheduling contract, unchanged) · [Discussion #22199](https://github.com/neomjs/neo/discussions/22199) (scheduling, axis B) |
| **Anti-anchor for** | a diff sliced across tasks · any realm besides the App worker that holds or relays trees · a second reply path |

## 1. Context

Today stage 3 runs in the VDom worker. The App worker clones each payload's `vdom` and old `vnode` and sends them over a channel. The worker diffs and replies with the deltas and every root's new vnode tree. That reply leaves through Main, which writes the deltas and then forwards the whole reply to the App worker. The [measurement record](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19582229) shows what that triangle costs:

1. **Cost follows the tree, not the change.** One changed text in 5,000 nodes costs 17–18 ms of CPU, and its delta applies in under 0.1 ms (finding 1).
2. **The wire is the largest share:** 63–64 % at 5,000 nodes, against 17–18 % for the diff itself (finding 2). Main relays trees it never reads: 1.0 ms per grid scroll flight, against 0.2–0.3 ms applying deltas (finding 3).
3. **Clones are garbage in every heap they pass.** A grid scroll causes 60–68 ms of collection on three threads and 12–17 ms on two (finding 11).
4. **On real apps** (tables 10 and 11, Julia), the line takes 79–93 % of the wire off Main. CPU falls 11 % on `apps/finance` and 28 % on `apps/covid`. The tree grid pays App-thread time: +12.7 % in table 11's interleaved series (65.4 → 73.7 ms), while its total CPU falls 9.1 % and Main falls 53.6 %. Its per-flight wall p90 stays flat (28.6 → 28.9 ms), and its per-flight CPU p90 is 9.4 ms, under one frame.
5. **An observed flow.** #22114's hosted Workstation tear-out race reproduced only when the VDom SharedWorker alone was preempted, and never under page-level throttling. The worker hop sits on a mount's critical path. This is not a load measurement ([Ada](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19885973)).

What the worker was for: the operator's 2021 reasons, quoted in the Discussion's body, and what the record found for each.

| Reason | Finding |
|---|---|
| The App worker would hold `VNode` instances, not plain objects | 0 of 6,125 adopted nodes are instances in either arm, because adoption copies with a spread (finding 12) |
| The round trip works as a scheduler | That property lives in Main's acknowledgement, which the line keeps: one hot leaf makes 58.9 flights a second in both arms |
| Mutable state: once trees are sent away, edits can resume at once | The in-realm arm shares 0 objects between adopted vnodes and live vdom, because the diff runs synchronously in the collecting task and copies what it keeps. That holds only while the diff stays one step, so it becomes invariant I1 (finding 12) |
| CPU offload when real-time data saturates the App worker | For content updates the offload has the wrong sign. At 5,000 nodes with 50 texts changing, the line holds 60 rounds a second and the lowest paint p90 of four routes, 14.5 ms, against today's 37–41 rounds and 30.8 ms. It is real for structural diffs: on a 1,000-node reversal the line leaves the data task 83–86 % of the App thread, against 90–91 % (tables 8 and 15) |
| Separation of concerns | Kept at module level: `Neo.vdom.Helper` stays one realm-agnostic module. It already runs in the component's own realm in 145 unit spec files |

The line has been at parity since #22159: an update's `meta`, a `Helper.create` auto-mount and the paint hook's order match the worker arm.

## 2. Decision

1. **Placement.** Stage 3 runs in the App worker, inside the task that collects the payload. The VDom worker retires.
2. **The line.** The App worker sends Main the deltas and `meta` with `Neo.applyDeltas()`. Main writes them in its frame and acknowledges, and stage 5 adopts the new vnode on that acknowledgement. Main never receives a vnode tree, except the subtree an insert delta carries, as it does today.
3. **Invariants.**
   - **I1. One synchronous step.** The diff runs to completion in the collecting task. That gives the snapshot that the clone gave before. Slicing it across tasks needs an amendment of this record that restores a copy.
   - **I2. The vnode never runs ahead of the DOM.** Adoption waits for Main's acknowledgement, and a failed write leaves the old vnode in place. Backpressure stays in that acknowledgement.
   - **I3. Deltas go to the window captured at collection.** `Helper.update` and `updateBatch` are synchronous, and the line sends with `Neo.applyDeltas(me.windowId, …)` in the collecting task ([`VdomLifecycle.mjs` L570–L585](https://github.com/neomjs/neo/blob/15ef0e9f8272bd91b141d858d387ddf722c08b1d/src/mixin/VdomLifecycle.mjs#L570-L585)). One microtask turn still separates the two, the `await Promise.resolve(…)`. The implementation therefore reads the window id before the helper call, not after. That closes the destination error [Euclid measured](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19687273) for a deferred reply.
   - **I4. `Neo.vdom.Helper` holds no App-worker state.**
4. **Migration, gated.**
   - **Phase 1: the default flips** to `useVdomWorker: false` once three observables hold. Today only a four-page boot smoke runs this arm (finding 10).
     - (a) The full hosted e2e matrix is green under `useVdomWorker: false`. `YieldedMoveCoalescingNL`, which drives the worker directly, stays pinned to `true` through Phase 2.
     - (b) A matched-repeat hosted tear-out comparison runs in both arms.
     - (c) At least one `useSharedWorkers: true` multi-window pop-out and re-dock e2e spec runs under `useVdomWorker: false`. It asserts I3's routing and that no in-flight state leaks when a window departs.
   - **Phase 2: deprecation.** For one minor release, `useVdomWorker: true` logs a warning that names this record, and so does a build config that still lists a `vdom` worker.
   - **Phase 3: removal.** It removes the worker, Main's interception of `updateVdom` and `autoMount` replies, the App ↔ VDom channel, the flag, its readers, and the prose that draws the triangle. A build config that still lists a `vdom` worker skips it with that warning instead of failing. `create-app` writes such an entry into every new workspace's `myApps.json`, so without the skip, upgrading would break their builds. The consumer repositories drop their entries in their own PRs (#22196).

<!-- binding-inventory: vdom-worker-retirement -->
- `src/worker/VDom.mjs`
- `src/worker/Manager.mjs`
- `src/worker/App.mjs`
- `src/worker/Base.mjs`
- `src/mixin/VdomLifecycle.mjs`
- `src/vdom/Helper.mjs`
- `src/DefaultConfig.mjs`
- `src/Main.mjs`
- `buildScripts/webpack/json/build.json`
- `buildScripts/webpack/buildThreads.mjs`
- `buildScripts/webpack/development/webpack.config.worker.mjs`
- `buildScripts/webpack/production/webpack.config.worker.mjs`
- `buildScripts/README.md`
- `learn/tree.json`
- `learn/README.md`
- `learn/guides/vdomengine/Overview.md`
- `learn/guides/vdomengine/VdomWorker.md`
- `learn/guides/fundamentals/WorkerArchitecture.md`
- `learn/guides/fundamentals/AsymmetricUpdates.md`
- `learn/guides/fundamentals/ApplicationBootstrap.md`
- `learn/guides/fundamentals/CodebaseOverview.md`
- `learn/benefits/body/ObjectPermanence.md`
- `learn/benefits/body/OffTheMainThread.md`
- `learn/tutorials/Earthquakes.md`
- `test/playwright/e2e/rendering/TwoThreadPipelineNL.spec.mjs`
- `test/playwright/e2e/rendering/YieldedMoveCoalescingNL.spec.mjs`
- `test/playwright/e2e/rendering/SparseUpdatesNL.spec.mjs`
- `test/playwright/unit/component/DepartedFirstRender.spec.mjs`
- `test/playwright/unit/worker/ConfigBase.spec.mjs`
- `test/playwright/unit/buildScripts/util/WorkflowScopeClassifier.spec.mjs`
- `test/playwright/unit/test/dedicatedWorkerNeuralLink.spec.mjs`
<!-- /binding-inventory: vdom-worker-retirement -->

## 3. Rejected Options

- **A0, keep.** Above about 1,000 nodes it costs more CPU on every measured shape. It keeps the App thread lower only for structural work: a reversal by 0.7 ms and a 1,000-node mount by 0.4 ms (finding 4, table 8).
- **A1, split reply.** It takes the relay off Main but keeps the clone wire, and it adds a join whose parked payload leaks when the second leg fails ([Julia](https://github.com/neomjs/neo/discussions/20751#discussioncomment-19608182)).
- **A3, stateful worker.** A vdom-only request saves the App thread 1.6 ms at 5,000 nodes. But 32 files under `src/` read `.vnode`, every write would have to reach the resident copy, and a restart loses the state. It was never prototyped.
- **A4, change-proportional payloads.** The vdom carries no change tracking, so every write would pay for marking.
- **A5, text wire.** JSON is lossy (`undefined`, `NaN`), 10 specs read the request, and its strings leave 38–45 ms of collection per scroll.
- **A7, direct reply.** It removes the relay without a join, but its deltas already take the line's route through the App worker while the clone wire and a third realm stay. Under load its paint p90 is 31 ms, against the line's 14.5 (table 15). Julia, who had adopted it on 11-14, yielded it to this decision.

**A6 is not rejected.** The leaf fast path composes with this decision. Its subtree form narrows the tree grid's App-thread cost without closing it: it reaches 36 % of that grid's nodes, against 97–99.8 % on the other apps (table 12).

## 4. Consequences

- **Gained:** less CPU per flight (findings 1 and 2, table 10), an idle Main between writes, one heap of garbage instead of three, the best loaded paint (table 15), one realm and one reply path fewer, and no relay interception.
- **Paid:**
  - a structural diff under saturation costs the data task 4–8 points of the App thread;
  - the tree grid's App thread pays +12.7 %, with no frame lost (§1, item 4); A6 narrows it;
  - a SharedWorker App worker diffs for every window it serves, as the VDom SharedWorker does today. On three windows of `apps/sharedcovid`, total CPU falls 14 % but Main rises 18 % (92.1 → 108.4 ms; a single run, table 11);
  - the diff's garbage lands in the App heap, and a long session is unmeasured.
- **Unmeasured, each a revalidation trigger:**
  - trees above 5,002 nodes;
  - Firefox and Safari;
  - a production build;
  - slow hardware, which Phase 1(b) measures.

  A real-app flow, on one build, in which the line drops a frame that the worker arm holds amends this record before Phase 3.
- **Scheduling is out of scope.** #8825 stays the contract, and the scheduling axis gets its own record from Discussion #22199. A synchronous diff with an ordered delta stream (the Discussion's B4) needs this record first.
