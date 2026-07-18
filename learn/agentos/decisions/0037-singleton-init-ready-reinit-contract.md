# ADR 0037: Singleton init/ready/re-init contract — the fenced `core.Base#reInitAsync` seam

> The lifecycle contract for re-initializing a `Neo.core.Base` singleton. Production runs `initAsync`
> exactly once (via `Neo.create`); an external re-run is a fatal double-init the framework forbids.
> Tests legitimately need to re-initialize process-singletons between cases. This ADR makes that a
> sanctioned, mechanically-fenced capability instead of a private reach-in — and retires the bespoke
> `_initPromise` idempotency guards that reach-in relied on.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-19 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005) |
| **Author** | @neo-opus-grace, with @neo-opus-ada's seam-design endorsement (Candidate 1 + the two mechanical conditions below) |
| **ADR classification** | `ADR_REQUIRED` — the decision changes the `core.Base` init/ready lifecycle surface, a framework-wide contract |
| **Grounds** | #15034 (the seam + the ~86-site test migration + guard deletion + repo-wide lint), sub of #15031 |
| **Depends on** | #15033 / PR #15039 — the production sweep that removed every external `initAsync()` call, making the bespoke guards safe to delete |
| **Aligns with** | ADR 0019 — this is a lifecycle capability, not AiConfig; the fence keys on `Neo.config.unitTestMode`, an operational runtime flag |
| **Anti-anchor for** | External `initAsync()` as a wait primitive (use `ready()`), doc-only "protected" as a production fence, wholesale `construct()` re-fire, and re-opening the #12597 cross-spec singleton-leak class |

---

## Context

`Neo.core.Base` initializes asynchronously exactly once: `construct()` creates a private `#readyPromise`
(+ its resolver), then a microtask runs `initAsync()` and sets `isReady = true`, which resolves the
promise and fires `ready`. The canonical external wait is `await instance.ready()`. `initAsync()`'s own
JSDoc is explicit: **calling it externally runs it twice → fatal duplication bugs.**

Two accreted patterns worked around the absence of a re-init capability:

1. **Bespoke `_initPromise` idempotency guards** (`GraphService`, and the lifecycle services) — an
   instance field guarding `initAsync` so a stray external call is harmless. These are the layer that
   made the double-init survivable, at the cost of a second, ad-hoc "am I initialized" source of truth
   parallel to `isReady`/`#readyPromise`.
2. **A private test reach-in** — specs re-initialize process-singletons between cases with
   `X._initPromise = null; await X.initAsync()` (~86 `test/` sites; the memory-core `util.mjs` is the
   staging point). This pokes a private guard field and then makes the forbidden external `initAsync()`
   call — it only "works" *because* the guards exist.

The result is a coupled knot: the guards cannot be deleted while the reach-in depends on them, and the
reach-in cannot migrate while `ready()` has no way to express "run init again" (its promise is already
resolved). #15033 cut the first thread by removing every external *production* `initAsync()` call, so
the guards are now dead weight in production — but only if the *test* re-init has a sanctioned home.

## Decision

Add a single, mechanically-fenced re-init method to `core.Base`:

```
async reInitAsync()   // Neo.core.Base
```

It **resets the ready gate** (`#readyPromise` + `#readyResolver` to a fresh unresolved pair, `isReady`
to `false`) and **re-runs only the async-init leg** (`await initAsync(); isReady = true`), returning the
reset ready promise. Two conditions are normative:

- **C1 — mechanical fence, not documentation.** JS has no enforced `protected`. `reInitAsync()` throws
  unless `Neo.config.unitTestMode` is true. Because this ADR also deletes the bespoke `_initPromise`
  guards, the fence is *the replacement safety net*: with the guards gone, it is the only thing between
  a stray re-init and a production double-init. (Precedent: `initRemote` and `Neo.mjs`'s namespace-collision
  path already gate on `unitTestMode`.)
- **C2 — re-run the async-init leg, not `construct()`.** `construct()` also does config wiring,
  Instance-manager registration, and listener setup — one-time construction concerns. Re-firing them
  risks double-registration and re-opening the #12597 cross-spec leak class. The seam re-runs `initAsync`
  only. In `unitTestMode`, `initRemote()` is already a no-op, so the re-run touches no remote registration.

The `_initPromise = null; initAsync()` reach-in migrates to `await X.reInitAsync()`; a first-init external
`initAsync()` wait migrates to `await X.ready()`; the bespoke `_initPromise` guards are deleted; and a
repo-wide lint forbids the external-`initAsync` and `_initPromise`-reach-in patterns in both trees.

## Rationale

The elimination is a hard-constraint argument, not a preference:

- **A test-util-only seam is impossible.** `#readyPromise` is a true `#private` field; nothing outside
  the class can reset it. The re-init must live where the private state lives — `core.Base`.
- **A real `destroy()` → re-create path is disproportionate.** `destroy()` unregisters from the Instance
  manager but never frees the class-namespace slot; `setupClass` returns the existing namespace on
  re-entry, and singleton modules export the *instance*. Re-creating a singleton is class-system surgery
  far beyond this need.
- **So Candidate 1 (a `core.Base` re-init) is the only proportionate shape** — reframed as a legitimate
  lifecycle *capability* (a singleton can be re-initialized), with tests the primary consumer, not the
  justification.

## Consequences

- `isReady` / `#readyPromise` / `ready()` become the single source of truth for "initialized"; the
  parallel `_initPromise` truth is gone.
- The seam is verifiable in isolation and is the exact behavior the ~86 migrated consumers exercise.
- The migration is **spec-green-critical**: it must hold under `--workers=1` *and* default parallelism,
  the two modes that expose the cross-spec leak — a guard deletion that quietly changes re-init behavior
  would reopen #12597. GraphService is the coupled case: its guard blocks re-init on `this.db`, so its
  deletion must restructure `initAsync` to run its init directly.
- Any *future* singleton that thinks it needs a bespoke idempotency guard should instead rely on
  `isReady`/`ready()` and, for tests, `reInitAsync()`. New `_initPromise` fields are an anti-pattern the
  lint rejects.
